"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

type OrbMode = "idle" | "listening" | "thinking" | "speaking";

// An original implementation of a "particle-sphere with dynamic proximity
// lines" central avatar — the concept (a floating point cloud that draws
// connections between nearby particles, denser/faster per conversation
// state) was inspired by browsing github.com/ethanplusai/jarvis's orb.ts for
// the general idea, but no code from that repo is used here: it ships under
// a personal/non-commercial-only license, so this is a clean-room rewrite
// with its own techniques (spatial-grid neighbor search instead of recomputing
// all-pairs distances every frame, different motion/state model, etc.).
const PARTICLE_COUNT = 480;
const SPHERE_RADIUS = 1.4;
const CONNECT_DIST = 0.34;
const MAX_LINES = 2200;

const modeColor: Record<OrbMode, THREE.Color> = {
  idle: new THREE.Color(0x5bd6ff),
  // Was coral/red — read as an error state rather than "listening". Green.
  listening: new THREE.Color(0x6effa0),
  thinking: new THREE.Color(0x9beeff),
  speaking: new THREE.Color(0xffce7a),
};

interface JarvisParticleOrbProps {
  mode?: OrbMode;
  /** Polled every frame while speaking (0..~0.6) — pulls particles inward
   * (denser connections) and brightens with real voice amplitude. */
  getIntensity?: () => number;
  className?: string;
}

export function JarvisParticleOrb({ mode = "idle", getIntensity, className = "absolute inset-0 z-0" }: JarvisParticleOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const prevModeRef = useRef(mode);
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // ---- particles ----
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const basePositions = new Float32Array(PARTICLE_COUNT * 3);
    const jitterPhase = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = Math.pow(Math.random(), 0.55) * SPHERE_RADIUS;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions.set([x, y, z], i * 3);
      basePositions.set([x, y, z], i * 3);
      jitterPhase[i] = Math.random() * Math.PI * 2;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: modeColor.idle,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(particleGeo, particleMaterial);
    group.add(points);

    // ---- dynamic connection lines: spatial-grid neighbor search each frame
    // (cheap — bucket by cell, only compare within/adjacent cells — rather
    // than an O(n²) all-pairs scan) ----
    const linePositions = new Float32Array(MAX_LINES * 2 * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: modeColor.idle,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMaterial);
    group.add(lines);

    const cellSize = CONNECT_DIST;
    const grid = new Map<string, number[]>();
    function cellKey(x: number, y: number, z: number) {
      return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
    }

    function layout() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(w, h);
    }
    layout();
    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let t = 0;
    let tumbleVel = 0; // brief spin kick on state transitions, decays away
    let listenFactor = 0;
    let thinkFactor = 0;
    let speakFactor = 0;

    function frame() {
      t += reduce ? 0.006 : 0.014;
      const m = modeRef.current;
      if (m !== prevModeRef.current) {
        prevModeRef.current = m;
        tumbleVel += 0.35 * (Math.random() > 0.5 ? 1 : -1);
      }
      listenFactor += ((m === "listening" ? 1 : 0) - listenFactor) * 0.08;
      thinkFactor += ((m === "thinking" ? 1 : 0) - thinkFactor) * 0.08;
      speakFactor += ((m === "speaking" ? 1 : 0) - speakFactor) * 0.1;

      const level = speakFactor > 0.05 ? Math.min(0.6, Math.max(0, getIntensityRef.current?.() ?? 0.3)) : 0;

      // idle drift/orbit + a bit of per-particle jitter; speaking pulls the
      // whole cloud inward (denser, tighter) proportional to real amplitude
      const pull = 1 - level * 0.35;
      const spin = t * (0.06 + thinkFactor * 0.14);
      const cosA = Math.cos(spin);
      const sinA = Math.sin(spin);
      const posAttr = particleGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];
        const wob = reduce ? 0 : Math.sin(t * 1.4 + jitterPhase[i]) * 0.04;
        const rx = (bx * cosA - bz * sinA) * pull;
        const rz = (bx * sinA + bz * cosA) * pull;
        posAttr.setXYZ(i, rx, (by + wob) * pull, rz);
      }
      posAttr.needsUpdate = true;

      // brief tumble impulse on state change, decaying to 0
      tumbleVel *= 0.92;
      group.rotation.y += tumbleVel * 0.05 + 0.0006;
      group.rotation.x += tumbleVel * 0.02;

      // ---- rebuild spatial grid + connection lines this frame ----
      grid.clear();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
        const key = cellKey(x, y, z);
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
      const connectDistSq = (CONNECT_DIST * pull) ** 2;
      let lineCount = 0;
      const linePosAttr = lineGeo.getAttribute("position") as THREE.BufferAttribute;
      outer: for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
        const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
              if (!bucket) continue;
              for (const j of bucket) {
                if (j <= i) continue;
                const jx = posAttr.getX(j), jy = posAttr.getY(j), jz = posAttr.getZ(j);
                const ddx = x - jx, ddy = y - jy, ddz = z - jz;
                const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
                if (distSq < connectDistSq) {
                  linePosAttr.setXYZ(lineCount * 2, x, y, z);
                  linePosAttr.setXYZ(lineCount * 2 + 1, jx, jy, jz);
                  lineCount++;
                  if (lineCount >= MAX_LINES) break outer;
                }
              }
            }
          }
        }
      }
      linePosAttr.needsUpdate = true;
      lineGeo.setDrawRange(0, lineCount * 2);

      // ---- color/opacity per state ----
      const color = modeColor.idle
        .clone()
        .lerp(modeColor.listening, listenFactor)
        .lerp(modeColor.thinking, thinkFactor)
        .lerp(modeColor.speaking, speakFactor);
      particleMaterial.color.copy(color);
      lineMaterial.color.copy(color);
      particleMaterial.opacity = 0.7 + level * 0.3;
      lineMaterial.opacity = 0.2 + thinkFactor * 0.15 + level * 0.35;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      particleGeo.dispose();
      particleMaterial.dispose();
      lineGeo.dispose();
      lineMaterial.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
