// The quiet scene behind the One Look screens: the Earth as seen from the crew, turning slowly.
// Pure decoration: no data, no controls, pointer events pass through. Assets are bundled (offline).
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Atmosphere } from '../globe-lab/Atmosphere';
import { Earth } from '../globe-lab/Earth';
import { Sky } from '../globe-lab/Sky';

function Turn({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.012;
  });
  return (
    <group ref={g} rotation={[0.35, -1.6, 0]}>
      {children}
    </group>
  );
}

export default function Backdrop({ side = 'right' }: { side?: 'right' | 'center' }) {
  return (
    <div className={`ds-scene is-${side}`} aria-hidden>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 4.4], fov: 32, near: 0.01, far: 1e7 }} gl={{ antialias: true, alpha: false }} frameloop="always">
        <color attach="background" args={['#05070f']} />
        <Suspense fallback={null}>
          <Sky sun={false} />
        </Suspense>
        <group position={side === 'right' ? [0.05, 0, 0] : [0, 0, 0]}>
          <Turn>
            <Suspense fallback={null}>
              <Earth />
            </Suspense>
            <Atmosphere />
          </Turn>
        </group>
      </Canvas>
    </div>
  );
}
