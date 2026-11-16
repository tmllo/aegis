// Deep space behind every tab in the dark theme (Emile, 16 Nov), turning slowly like the Radiation
// page: the real sky (NASA SVS Deep Star Maps 2020, public domain, svs.gsfc.nasa.gov/4851) on a far
// sphere around a camera that yaws very slowly. No sun, no flares, no field line: just space.
// Still under prefers-reduced-motion. Hidden on the Radiation page, which draws its own scene.
import { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Sky() {
  // the real sky at 8K (Emile, 16 Nov): NASA SVS Deep Star Maps 2020, sharper than the 4K version
  const tex = useTexture('/space/sky-8192.jpg');
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const g = useRef<THREE.Group>(null);
  // the sky moves very slowly, so ~15 frames a second is plenty and leaves the GPU to the body
  const { invalidate } = useThree();
  const t0 = useRef(performance.now());
  useEffect(() => {
    if (REDUCE) return;
    const id = window.setInterval(() => invalidate(), 66);
    return () => window.clearInterval(id);
  }, [invalidate]);
  useFrame(() => {
    if (!g.current || REDUCE) return;
    g.current.rotation.y = -0.1 + ((performance.now() - t0.current) / 1000) * 0.012; // one turn in about 9 minutes
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
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 0, 0.01], fov: 62, near: 0.01, far: 200 }} gl={{ antialias: false, powerPreference: 'low-power' }}>
        <color attach="background" args={['#03050c']} />
        <Suspense fallback={null}>
          <Sky />
        </Suspense>
      </Canvas>
    </div>
  );
}
