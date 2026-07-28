"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

type OrbMode = "idle" | "listening" | "thinking" | "speaking";

// Two-layer "sun": (1) a static geodesic wireframe sphere (icosahedron edges
// — a fixed lattice, never reshapes) with a glowing core sprite inside, and
// (2) a shell of small glowing nodes orbiting around it at a larger radius —
// NOT attached to the wireframe's vertices, and not connected to each other
// by lines; their collective positions just suggest a bigger sphere
// enclosing the lattice. While speaking, each shell node's distance from
// center pulses independently (different phase/amplitude per node) so the
// shell "boils" unevenly rather than breathing in and out uniformly.
const WIRE_RADIUS = 1.3;
const SHELL_RADIUS = WIRE_RADIUS * 1.08;
const SHELL_COUNT = 130;

const modeColor: Record<OrbMode, THREE.Color> = {
  idle: new THREE.Color(0x5bd6ff),
  // Was coral/red — read as an error state rather than "listening". Green.
  listening: new THREE.Color(0x6effa0),
  thinking: new THREE.Color(0x9beeff),
  speaking: new THREE.Color(0xb15bff),
};

interface GeodesicSunProps {
  mode?: OrbMode;
  /** Polled every frame while speaking (0..~0.6) — scales how unevenly the
   * outer node shell pulses in/out. */
  getIntensity?: () => number;
  className?: string;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function GeodesicSun({ mode = "idle", getIntensity, className = "absolute inset-0 z-0" }: GeodesicSunProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const getIntensityRef = useRef(getIntensity);
  getIntensityRef.current = getIntensity;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    // No antialias: thin wireframe lines + additive-blended points are
    // already soft; MSAA here just burns fill-rate on a page stacking 2
    // full-screen WebGL canvases at once.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // ---- layer 1: static geodesic wireframe lattice ----
    const wireGeoSource = new THREE.IcosahedronGeometry(WIRE_RADIUS, 2);
    const edges = new THREE.EdgesGeometry(wireGeoSource, 1);
    const wireMaterial = new THREE.LineBasicMaterial({
      color: modeColor.idle,
      transparent: true,
      opacity: 0.6,
    });
    const wireframe = new THREE.LineSegments(edges, wireMaterial);
    group.add(wireframe);

    // glowing core inside the lattice
    const glowTexture = makeGlowTexture();
    const coreMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: modeColor.idle,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Sprite(coreMaterial);
    core.scale.set(WIRE_RADIUS * 1.3, WIRE_RADIUS * 1.3, 1);
    group.add(core);

    // ---- layer 2: orbiting node shell (independent of the lattice) ----
    // Evenly distributed via a Fibonacci sphere lattice (golden-angle spiral)
    // — a uniform random scatter (the first attempt) reads as a loose dust
    // cloud, not the regularly-spaced pattern in the reference. Per-node
    // phase/freq are kept only for the *speaking* uneven pulse (see frame());
    // at rest all nodes share one synchronized breathing motion instead.
    const shellBase = new Float32Array(SHELL_COUNT * 3); // unit directions
    const shellPositions = new Float32Array(SHELL_COUNT * 3);
    const shellPhase = new Float32Array(SHELL_COUNT);
    const shellFreq = new Float32Array(SHELL_COUNT);
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < SHELL_COUNT; i++) {
      const y = 1 - (i / (SHELL_COUNT - 1)) * 2; // 1..-1, evenly spaced
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = GOLDEN_ANGLE * i;
      shellBase[i * 3] = Math.cos(theta) * radiusAtY;
      shellBase[i * 3 + 1] = y;
      shellBase[i * 3 + 2] = Math.sin(theta) * radiusAtY;
      shellPhase[i] = Math.random() * Math.PI * 2;
      shellFreq[i] = 0.6 + Math.random() * 1.6;
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.BufferAttribute(shellPositions, 3));
    const shellMaterial = new THREE.PointsMaterial({
      color: modeColor.idle,
      size: 0.05,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shell = new THREE.Points(shellGeo, shellMaterial);
    group.add(shell);

    function layout() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h);
    }
    layout();
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let t = 0;
    let listenFactor = 0;
    let thinkFactor = 0;
    let speakFactor = 0;

    function frame() {
      t += reduce ? 0.006 : 0.013;
      const m = modeRef.current;
      listenFactor += ((m === "listening" ? 1 : 0) - listenFactor) * 0.08;
      thinkFactor += ((m === "thinking" ? 1 : 0) - thinkFactor) * 0.08;
      speakFactor += ((m === "speaking" ? 1 : 0) - speakFactor) * 0.1;
      const level = speakFactor > 0.05 ? Math.min(0.6, Math.max(0, getIntensityRef.current?.() ?? 0.3)) : 0;

      const color = modeColor.idle
        .clone()
        .lerp(modeColor.listening, listenFactor)
        .lerp(modeColor.thinking, thinkFactor)
        .lerp(modeColor.speaking, speakFactor);
      wireMaterial.color.copy(color);
      wireMaterial.opacity = 0.5 + thinkFactor * 0.2 + level * 0.15;
      coreMaterial.color.copy(color);
      const corePulse = 1 + Math.sin(t * 2.2) * 0.06 + level * 0.35;
      core.scale.set(WIRE_RADIUS * 1.3 * corePulse, WIRE_RADIUS * 1.3 * corePulse, 1);
      coreMaterial.opacity = 0.7 + level * 0.3;
      shellMaterial.color.copy(color);
      shellMaterial.opacity = 0.75 + level * 0.25;

      // static lattice never reshapes — only a very slow whole-group spin so
      // it doesn't look frozen, independent of the shell's own motion.
      group.rotation.y += 0.0009;

      // outer shell: at rest every node shares the exact same orbit + the
      // exact same tiny breathing pulse (one shared sine, not per-node) so
      // the whole shell reads as one rigid, evenly-moving surface — this is
      // what the reference actually shows. Per-node independent wobble only
      // fades in via `level`, so it's speaking-only, not a baseline jitter.
      const orbitSpin = t * 0.12;
      const cosO = Math.cos(orbitSpin);
      const sinO = Math.sin(orbitSpin);
      const sharedBreath = Math.sin(t * 0.5) * 0.02;
      const speakAmp = level * 0.55;
      for (let i = 0; i < SHELL_COUNT; i++) {
        const bx = shellBase[i * 3];
        const by = shellBase[i * 3 + 1];
        const bz = shellBase[i * 3 + 2];
        // shared slow orbit around Y
        const ox = bx * cosO - bz * sinO;
        const oz = bx * sinO + bz * cosO;
        const uneven = speakAmp > 0.001 ? Math.sin(t * shellFreq[i] + shellPhase[i]) * speakAmp : 0;
        const r = SHELL_RADIUS + sharedBreath + uneven;
        shellPositions[i * 3] = ox * r;
        shellPositions[i * 3 + 1] = by * r;
        shellPositions[i * 3 + 2] = oz * r;
      }
      (shellGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    }
    // Cap to 60fps: ambient decoration that never stops while the tab is
    // visible, so its sustained GPU/thermal cost matters far more than
    // tracking the display's native refresh rate (up to 120Hz on ProMotion).
    const FRAME_INTERVAL_MS = 1000 / 60;
    let lastFrameAt = 0;
    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
      lastFrameAt = now;
      frame();
    }
    // Stop rendering entirely (not just skip drawing) while the tab is
    // backgrounded — an invisible full-screen WebGL scene still burns GPU
    // cycles/heat every frame if the RAF loop keeps running.
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      wireGeoSource.dispose();
      edges.dispose();
      wireMaterial.dispose();
      glowTexture.dispose();
      coreMaterial.dispose();
      shellGeo.dispose();
      shellMaterial.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden />;
}
