"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Drifting depth-layered particle field — recreated from the constellation-v2
// experiment's orb background (two shells of points, near ones bigger/
// brighter, far ones smaller/dimmer, slowly orbiting) as a standalone
// background layer behind the main swarm/ring/beam canvas. Purely ambient —
// deliberately NOT wired to voice level/state, unlike the rest of the page.
interface ParticleFieldBackgroundProps {
  className?: string;
}

export function ParticleFieldBackground({ className = "absolute inset-0 z-0" }: ParticleFieldBackgroundProps) {
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    function buildParticles(count: number, rMin: number, rMax: number, size: number, color: number, opacity: number) {
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
        speeds[i] = 0.4 + Math.random() * 0.8;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true });
      const points = new THREE.Points(geo, material);
      scene.add(points);
      return { points, geo, material, basePositions, speeds, count };
    }

    const nearParticles = buildParticles(reduce ? 90 : 240, 2.1, 3.6, 0.03, 0x8fe9ff, 0.6);
    const farParticles = buildParticles(reduce ? 70 : 220, 3.6, 6.2, 0.018, 0x3d7ea8, 0.35);

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

    function animateParticles(p: ReturnType<typeof buildParticles>, t: number, speedMul: number) {
      const posAttr = p.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const bx = p.basePositions[i * 3];
        const by = p.basePositions[i * 3 + 1];
        const bz = p.basePositions[i * 3 + 2];
        const angle = t * 0.12 * p.speeds[i] * speedMul;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        posAttr.setXYZ(i, bx * cosA - bz * sinA, by, bx * sinA + bz * cosA);
      }
      posAttr.needsUpdate = true;
    }

    let raf = 0;
    let t = 0;

    function frame() {
      t += reduce ? 0.006 : 0.016;

      animateParticles(nearParticles, t, 1);
      animateParticles(farParticles, t, 0.55);
      nearParticles.points.rotation.y += 0.0006;
      farParticles.points.rotation.y += 0.00025;

      renderer.render(scene, camera);
    }

    function loop() {
      frame();
      raf = requestAnimationFrame(loop);
    }
    if (reduce) frame();
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      nearParticles.geo.dispose();
      nearParticles.material.dispose();
      farParticles.geo.dispose();
      farParticles.material.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden />;
}
