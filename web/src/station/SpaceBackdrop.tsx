// Deep space behind every tab in the dark theme (Emile, 16 Nov), turning slowly like the Radiation
// page: the real sky (NASA SVS Deep Star Maps 2020, public domain, svs.gsfc.nasa.gov/4851) on a far
// sphere around a camera that yaws very slowly. No sun, no flares, no field line: just space.
// Still under prefers-reduced-motion. Hidden on the Radiation page, which draws its own scene.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Sky() {
  const tex = useTexture('/space/sky-4096.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!g.current || REDUCE) return;
    g.current.rotation.y += Math.min(dt, 0.1) * 0.012; // one turn in about 9 minutes
  });
  return (
    // aimed so the Milky Way core crosses the screen diagonally behind the content
    <group ref={g} rotation={[-0.45, -0.1, 0.55]}>
      <mesh>
        <sphereGeometry args={[50, 96, 48]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} color="#d6d6d6" />
      </mesh>
    </group>
  );
}

export default function SpaceBackdrop() {
  return (
    <div className="space-bg" aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 0.01], fov: 62, near: 0.01, far: 200 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
        <color attach="background" args={['#03050c']} />
        <Suspense fallback={null}>
          <Sky />
        </Suspense>
      </Canvas>
    </div>
  );
}
