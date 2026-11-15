// Real space: the NASA SVS Deep Star Maps 2020 sky as the background (public domain; Gaia DR2:
// ESA/Gaia/DPAC) and the Moon from the NASA SVS CGI Moon Kit (LRO LROC colour + LOLA elevation,
// public domain), lit by the one sun with no ambient fill and a tiny earthshine on the dark side.
// Both are small textures loaded after the first view.
import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const base = `${import.meta.env.BASE_URL}refs/space/`;

/** Dropped: a 4K sky map is blurry behind the body at this field of view. The fine point stars
 * in the scene carry the sky; this stays as a no-op so the scene keeps building. */
export function StarSky() {
  return null;
}

export function Moon({ position, radius = 0.27 }: { position: [number, number, number]; radius?: number }) {
  const [color, height] = useTexture([`${base}moon-color-2k.jpg`, `${base}moon-height-1k.jpg`]);
  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 4;
  }, [color]);
  return (
    <mesh position={position} raycast={() => null}>
      <sphereGeometry args={[radius, 128, 128]} />
      {/* displacement exaggerated a little; earthshine as a tiny emissive term */}
      <meshStandardMaterial map={color} displacementMap={height} displacementScale={radius * 0.012} bumpMap={height} bumpScale={0.6} roughness={0.95} metalness={0} emissive="#22303c" emissiveIntensity={0.05} />
    </mesh>
  );
}
