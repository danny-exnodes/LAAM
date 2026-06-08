'use client';

import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MechModel, type MechHandles } from './MechModel';

// Local-first reflections: build a RoomEnvironment env map in-process (no CDN
// HDRI download). Gives the PBR metal something to mirror.
function StudioEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

// Default export so it can be loaded via next/dynamic({ ssr: false }).
export default function Mech3D({
  progressRef,
  pointerRef,
  active,
}: MechHandles & { active: boolean }) {
  return (
    <Canvas
      camera={{ fov: 40, position: [0, 0.2, 10] }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'never'}
      style={{ position: 'absolute', inset: 0 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.12;
      }}
    >
      <StudioEnv />
      <hemisphereLight args={['#9fc8ff', '#06121f', 0.7]} />
      <directionalLight position={[-6, 7, 6]} intensity={2.4} color="#c6dcff" />
      <directionalLight position={[5, -2, -5]} intensity={1.5} color="#36a6d6" />
      <pointLight position={[0, 0.2, 0.8]} intensity={7} distance={9} color="#36a6d6" />
      <MechModel progressRef={progressRef} pointerRef={pointerRef} />
    </Canvas>
  );
}
