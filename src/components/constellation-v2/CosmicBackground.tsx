"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// A cosmic backdrop for the v2 orb page: a starfield (two depth layers, same
// trick as ParticleFieldBackground) with faint lines connecting nearby stars
// into constellation-like shapes, a soft nebula glow behind it all, an
// occasional shooting star, and a very slow autonomous camera drift (NOT
// mouse-driven — kept independent of the orb's own hover-state behavior).
interface CosmicBackgroundProps {
  className?: string;
  /** Faint lines connecting nearby stars into constellation-like shapes. */
  showLinks?: boolean;
}

export function CosmicBackground({ className = "absolute inset-0 z-0", showLinks = true }: CosmicBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    // No antialias: geometry here is only Points/LineSegments (glow-blended,
    // no hard triangle edges), so MSAA buys nothing visible but still costs
    // GPU fill-rate on every one of this page's stacked full-screen canvases.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // ---- nebula glow: soft colored gas clouds behind the starfield ----
    function makeGlowTexture(): THREE.CanvasTexture {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.4, "rgba(255,255,255,0.4)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }
    const glowTexture = makeGlowTexture();
    const nebulaSpecs = [
      { color: 0x5b2f8c, pos: [-2.4, 1.1, -4], scale: 7 },
      { color: 0x1f4d6b, pos: [2.6, -1.2, -5], scale: 8 },
      { color: 0x6b2350, pos: [0.4, 1.8, -6], scale: 6 },
    ];
    const nebulae = nebulaSpecs.map((spec) => {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: spec.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      sprite.scale.set(spec.scale, spec.scale, 1);
      scene.add(sprite);
      return sprite;
    });

    // ---- starfield: two depth layers, same shape as ParticleFieldBackground ----
    function buildStars(count: number, rMin: number, rMax: number, size: number, opacity: number) {
      const positions = new Float32Array(count * 3);
      const basePositions = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        positions.set([x, y, z], i * 3);
        basePositions.set([x, y, z], i * 3);
        speeds[i] = 0.3 + Math.random() * 0.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xcfe8ff,
        size,
        transparent: true,
        opacity,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geo, material);
      scene.add(points);
      return { points, geo, basePositions, speeds, count };
    }

    const nearStars = buildStars(reduce ? 90 : 300, 2.1, 3.8, 0.028, 0.75);
    const farStars = buildStars(reduce ? 70 : 280, 3.8, 6.4, 0.016, 0.4);

    // ---- constellation lines: TRUE nearest-neighbor pairs (by actual 3D
    // distance in the spherical scatter — array index proximity does NOT
    // imply spatial proximity for a randomly-placed point cloud, which is
    // what produced long screen-spanning lines instead of tight local
    // clusters). Picked once from BASE positions, not recomputed per frame;
    // the slow drift of individually-orbiting stars lets the shapes gently
    // reshape over time instead of staying perfectly rigid. ----
    const LINK_COUNT = reduce || !showLinks ? 0 : 26;
    const linkPairs: [number, number][] = [];
    if (!reduce) {
      const bp = nearStars.basePositions;
      // Scanning all 240 candidates per anchor (~57k ops, once, at mount) to
      // find the TRUE nearest neighbor — a 40-point random sample (the first
      // attempt) too often missed anything genuinely close in a 240-point
      // spherical scatter, which is what produced screen-spanning lines.
      const maxDistSq = 0.9 * 0.9; // reject pairs with no close neighbor at all
      const used = new Set<number>();
      let attempts = 0;
      while (linkPairs.length < LINK_COUNT && attempts < LINK_COUNT * 8) {
        attempts++;
        const a = Math.floor(Math.random() * nearStars.count);
        let best = -1;
        let bestDist = Infinity;
        for (let b = 0; b < nearStars.count; b++) {
          if (b === a) continue;
          const dx = bp[a * 3] - bp[b * 3];
          const dy = bp[a * 3 + 1] - bp[b * 3 + 1];
          const dz = bp[a * 3 + 2] - bp[b * 3 + 2];
          const dist = dx * dx + dy * dy + dz * dz;
          if (dist < bestDist) {
            bestDist = dist;
            best = b;
          }
        }
        if (best < 0 || bestDist > maxDistSq) continue;
        const pairKey = a < best ? a * 100000 + best : best * 100000 + a;
        if (used.has(pairKey)) continue;
        used.add(pairKey);
        linkPairs.push([a, best]);
      }
    }
    const linkGeo = new THREE.BufferGeometry();
    const linkPositions = new Float32Array(linkPairs.length * 2 * 3);
    linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPositions, 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.22,
    });
    const links = new THREE.LineSegments(linkGeo, linkMaterial);
    scene.add(links);

    // ---- occasional shooting star ----
    const shootGeo = new THREE.BufferGeometry();
    const shootPositions = new Float32Array(2 * 3);
    shootGeo.setAttribute("position", new THREE.BufferAttribute(shootPositions, 3));
    const shootMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const shootingStar = new THREE.LineSegments(shootGeo, shootMaterial);
    scene.add(shootingStar);
    let shootT = -1; // -1 = inactive
    let shootStart = new THREE.Vector3();
    let shootEnd = new THREE.Vector3();
    let nextShootAt = reduce ? Infinity : 3 + Math.random() * 6;

    function layout() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Fill-rate cost scales with pixel-ratio squared; 1.5 vs the previous
      // 1.75 cap is a real GPU/heat saving on Retina displays across this
      // page's 2-3 stacked full-screen canvases and is not visually
      // distinguishable for glow-blended points/lines at this size.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h);
    }
    layout();
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    function animateStars(s: ReturnType<typeof buildStars>, t: number, speedMul: number) {
      const posAttr = s.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < s.count; i++) {
        const bx = s.basePositions[i * 3];
        const by = s.basePositions[i * 3 + 1];
        const bz = s.basePositions[i * 3 + 2];
        const angle = t * 0.1 * s.speeds[i] * speedMul;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        posAttr.setXYZ(i, bx * cosA - bz * sinA, by, bx * sinA + bz * cosA);
      }
      posAttr.needsUpdate = true;
    }

    let raf = 0;
    let t = 0;

    function frame() {
      t += reduce ? 0.004 : 0.01;

      animateStars(nearStars, t, 1);
      animateStars(farStars, t, 0.5);
      nearStars.points.rotation.y += 0.00025;
      farStars.points.rotation.y += 0.0001;

      // constellation lines follow the (now-orbited) near-star positions
      const nearPos = nearStars.geo.getAttribute("position") as THREE.BufferAttribute;
      const linkPos = linkGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < linkPairs.length; i++) {
        const [a, b] = linkPairs[i];
        linkPos.setXYZ(i * 2, nearPos.getX(a), nearPos.getY(a), nearPos.getZ(a));
        linkPos.setXYZ(i * 2 + 1, nearPos.getX(b), nearPos.getY(b), nearPos.getZ(b));
      }
      linkPos.needsUpdate = true;
      links.rotation.y = nearStars.points.rotation.y;

      // very slow autonomous drift (not mouse-driven) — feels like floating
      camera.position.x = Math.sin(t * 0.06) * 0.35;
      camera.position.y = Math.cos(t * 0.05) * 0.2;
      camera.lookAt(0, 0, 0);
      for (const n of nebulae) {
        n.material.opacity = 0.3 + Math.sin(t * 0.15 + n.position.x) * 0.08;
      }

      // shooting star
      if (shootT < 0 && t > nextShootAt) {
        shootStart.set(-3 + Math.random() * 2, 1.5 + Math.random() * 1, -1 - Math.random() * 2);
        shootEnd.set(shootStart.x + 2.5 + Math.random(), shootStart.y - 1.5 - Math.random(), shootStart.z);
        shootT = 0;
      }
      if (shootT >= 0) {
        shootT += reduce ? 0 : 0.03;
        if (shootT >= 1) {
          shootT = -1;
          shootMaterial.opacity = 0;
          nextShootAt = t + 4 + Math.random() * 8;
        } else {
          const head = shootStart.clone().lerp(shootEnd, shootT);
          const tail = shootStart.clone().lerp(shootEnd, Math.max(0, shootT - 0.08));
          const pos = shootGeo.getAttribute("position") as THREE.BufferAttribute;
          pos.setXYZ(0, tail.x, tail.y, tail.z);
          pos.setXYZ(1, head.x, head.y, head.z);
          pos.needsUpdate = true;
          shootMaterial.opacity = Math.sin(Math.min(1, shootT * 4)) * (1 - shootT) * 0.9;
        }
      }

      renderer.render(scene, camera);
    }

    // Cap to 60fps: this is ambient background decoration, not something
    // that benefits from tracking a 120Hz ProMotion display — cutting the
    // draw-call rate roughly in half still meaningfully reduces this
    // canvas's sustained GPU/thermal load, which matters because it never
    // stops while the tab is visible (unlike the visibilitychange pause
    // below, which only helps when the tab is actually backgrounded).
    // (30fps was tried first but read as visibly stuttery for this motion.)
    const FRAME_INTERVAL_MS = 1000 / 60;
    let lastFrameAt = 0;
    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
      lastFrameAt = now;
      frame();
    }
    // Backgrounded tabs get zero benefit from a full-screen WebGL scene
    // still rendering every frame — stop the loop entirely on hide (not
    // just skip drawing) so the GPU actually goes idle instead of burning
    // cycles/heat on invisible frames.
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !reduce) {
        raf = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (reduce) frame();
    else if (!document.hidden) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      glowTexture.dispose();
      for (const n of nebulae) n.material.dispose();
      nearStars.geo.dispose();
      (nearStars.points.material as THREE.Material).dispose();
      farStars.geo.dispose();
      (farStars.points.material as THREE.Material).dispose();
      linkGeo.dispose();
      linkMaterial.dispose();
      shootGeo.dispose();
      shootMaterial.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden />;
}
