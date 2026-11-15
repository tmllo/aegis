// Real space: the NASA SVS Deep Star Maps 2020 sky as the background (public domain; Gaia DR2:
// ESA/Gaia/DPAC) and the Moon from the NASA SVS CGI Moon Kit (LRO LROC colour + LOLA elevation,
// public domain), lit by the one sun with no ambient fill and a tiny earthshine on the dark side.
// Both are small textures loaded after the first view.
import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const base = `${import.meta.env.BASE_URL}refs/space/`;

export function StarSky() {
  const tex = useTexture(`${base}starmap-4k.jpg`);
  const { scene } = useThree();
  useMemo(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    scene.backgroundIntensity = 0.12; // a faint Milky Way haze; the point stars on top carry the detail
  }, [tex, scene]);
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
