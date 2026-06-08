'use client';

import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// Static per-part config: assembled home position + explode direction + distance.
// Ported from the validated POC. `position = home + normalize(dir) * dist * p`.
const PART_CFG = {
  core: { home: [0, 0.25, 0], dir: [0, 0, 1], dist: 0.55 },
  head: { home: [0, 1.32, 0.06], dir: [0, 1, 0.25], dist: 1.8 },
  backpack: { home: [0, 0.4, -0.6], dir: [0, 0.25, -1], dist: 1.8 },
  armL: { home: [-1.02, 0.6, 0], dir: [-1, 0.05, 0.12], dist: 1.95 },
  armR: { home: [1.02, 0.6, 0], dir: [1, 0.05, 0.12], dist: 1.95 },
  hips: { home: [0, -0.78, 0], dir: [0, -0.55, 0.45], dist: 1.25 },
  legL: { home: [-0.44, -1.55, 0], dir: [-0.55, -1, 0.12], dist: 1.85 },
  legR: { home: [0.44, -1.55, 0], dir: [0.55, -1, 0.12], dist: 1.85 },
} as const;
type PartKey = keyof typeof PART_CFG;

export interface MechHandles {
  progressRef: RefObject<number>;
  pointerRef: RefObject<{ x: number; y: number }>;
}

export function MechModel({ progressRef, pointerRef }: MechHandles) {
  const mech = useRef<THREE.Group>(null);
  const partRefs = useRef<Partial<Record<PartKey, THREE.Group | null>>>({});

  const mats = useMemo(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: 0x244a72, metalness: 0.92, roughness: 0.33 }),
      white: new THREE.MeshStandardMaterial({ color: 0xaec6da, metalness: 0.78, roughness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x0e2236, metalness: 0.82, roughness: 0.5 }),
      accent: new THREE.MeshStandardMaterial({
        color: 0x0a2233, emissive: new THREE.Color(0x36a6d6), emissiveIntensity: 2.6, metalness: 0.5, roughness: 0.3,
      }),
    }),
    [],
  );

  const vecs = useMemo(() => {
    const out = {} as Record<PartKey, { home: THREE.Vector3; ex: THREE.Vector3 }>;
    (Object.keys(PART_CFG) as PartKey[]).forEach((k) => {
      const c = PART_CFG[k];
      out[k] = {
        home: new THREE.Vector3(c.home[0], c.home[1], c.home[2]),
        ex: new THREE.Vector3(c.dir[0], c.dir[1], c.dir[2]).normalize().multiplyScalar(c.dist),
      };
    });
    return out;
  }, []);

  const pSmooth = useRef(0);
  useFrame(() => {
    const target = progressRef.current ?? 0;
    pSmooth.current += (target - pSmooth.current) * 0.08; // glide toward scroll target
    const p = pSmooth.current;
    (Object.keys(vecs) as PartKey[]).forEach((k) => {
      const g = partRefs.current[k];
      if (g) g.position.copy(vecs[k].home).addScaledVector(vecs[k].ex, p);
    });
    if (mech.current) {
      const ptr = pointerRef.current ?? { x: 0, y: 0 };
      mech.current.rotation.y = ptr.x * 0.6 + p * 0.35 + 0.12;
      mech.current.rotation.x = ptr.y * 0.3 - 0.02;
    }
  });

  const set = (k: PartKey) => (el: THREE.Group | null) => {
    partRefs.current[k] = el;
  };

  return (
    <group ref={mech} position={[0, 0.35, 0]} scale={0.92}>
      {/* TORSO / reactor core */}
      <group ref={set('core')} position={PART_CFG.core.home as unknown as THREE.Vector3Tuple}>
        <RoundedBox args={[1.55, 1.55, 0.9]} radius={0.14} material={mats.steel} />
        <RoundedBox args={[0.9, 0.3, 0.7]} radius={0.08} material={mats.dark} position={[0, 0.85, 0]} />
        <RoundedBox args={[0.16, 1.15, 0.95]} radius={0.05} material={mats.dark} position={[-0.8, 0, 0]} />
        <RoundedBox args={[0.16, 1.15, 0.95]} radius={0.05} material={mats.dark} position={[0.8, 0, 0]} />
        <mesh material={mats.accent} position={[0, 0.12, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.07, 16, 32]} />
        </mesh>
        <mesh material={mats.accent} position={[0, 0.12, 0.46]}>
          <sphereGeometry args={[0.22, 28, 28]} />
        </mesh>
      </group>

      {/* HEAD */}
      <group ref={set('head')} position={PART_CFG.head.home as unknown as THREE.Vector3Tuple}>
        <RoundedBox args={[0.64, 0.56, 0.62]} radius={0.1} material={mats.steel} />
        <RoundedBox args={[0.5, 0.16, 0.06]} radius={0.04} material={mats.accent} position={[0, 0.03, 0.32]} />
        <RoundedBox args={[0.1, 0.22, 0.2]} radius={0.04} material={mats.white} position={[-0.36, 0.04, 0]} />
        <RoundedBox args={[0.1, 0.22, 0.2]} radius={0.04} material={mats.white} position={[0.36, 0.04, 0]} />
        <RoundedBox args={[0.12, 0.34, 0.12]} radius={0.03} material={mats.accent} position={[0, 0.4, 0.05]} />
      </group>

      {/* BACKPACK + thrusters */}
      <group ref={set('backpack')} position={PART_CFG.backpack.home as unknown as THREE.Vector3Tuple}>
        <RoundedBox args={[1.05, 1.0, 0.42]} radius={0.08} material={mats.dark} />
        <mesh material={mats.white} position={[-0.32, -0.5, -0.12]} rotation={[0.34, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.18, 0.6, 20]} />
        </mesh>
        <mesh material={mats.white} position={[0.32, -0.5, -0.12]} rotation={[0.34, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.18, 0.6, 20]} />
        </mesh>
        <mesh material={mats.accent} position={[-0.32, -0.82, -0.22]} rotation={[0.34, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 20]} />
        </mesh>
        <mesh material={mats.accent} position={[0.32, -0.82, -0.22]} rotation={[0.34, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 20]} />
        </mesh>
      </group>

      {/* ARMS (identical local geometry; home positions differ) */}
      {(['armL', 'armR'] as const).map((side) => (
        <group key={side} ref={set(side)} position={PART_CFG[side].home as unknown as THREE.Vector3Tuple}>
          <RoundedBox args={[0.56, 0.56, 0.66]} radius={0.14} material={mats.steel} />
          <RoundedBox args={[0.36, 0.74, 0.36]} radius={0.09} material={mats.white} position={[0, -0.62, 0]} />
          <RoundedBox args={[0.4, 0.14, 0.4]} radius={0.04} material={mats.accent} position={[0, -1.02, 0]} />
          <RoundedBox args={[0.32, 0.72, 0.32]} radius={0.08} material={mats.steel} position={[0, -1.42, 0]} />
          <RoundedBox args={[0.32, 0.32, 0.34]} radius={0.07} material={mats.dark} position={[0, -1.86, 0]} />
        </group>
      ))}

      {/* HIPS */}
      <group ref={set('hips')} position={PART_CFG.hips.home as unknown as THREE.Vector3Tuple}>
        <RoundedBox args={[1.12, 0.52, 0.72]} radius={0.1} material={mats.steel} />
        <RoundedBox args={[0.4, 0.3, 0.5]} radius={0.05} material={mats.accent} position={[0, 0, 0.28]} />
      </group>

      {/* LEGS (identical local geometry; home positions differ) */}
      {(['legL', 'legR'] as const).map((side) => (
        <group key={side} ref={set(side)} position={PART_CFG[side].home as unknown as THREE.Vector3Tuple}>
          <RoundedBox args={[0.52, 0.92, 0.58]} radius={0.1} material={mats.white} />
          <RoundedBox args={[0.5, 0.16, 0.52]} radius={0.04} material={mats.accent} position={[0, -0.52, 0]} />
          <RoundedBox args={[0.48, 0.98, 0.54]} radius={0.08} material={mats.steel} position={[0, -1.08, 0]} />
          <RoundedBox args={[0.58, 0.26, 0.86]} radius={0.06} material={mats.dark} position={[0, -1.7, 0.12]} />
        </group>
      ))}
    </group>
  );
}
