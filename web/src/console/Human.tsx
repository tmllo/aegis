// The visible human: Blender Studio realistic male base mesh (CC0), anatomical pose, 1.71 m,
// aligned with the BodyParts3D anatomy. Warm skin with a soft sheen and its normal map. Full
// opacity in the overview; when a region or vital is open the skin fades to about 25 % so the
// anatomy and the flagged organ show through.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const URL = `${import.meta.env.BASE_URL}models/human-neutral.glb`;

export function Human({ open }: { open: boolean }) {
  const { scene } = useGLTF(URL, false, true);
  const skin = useRef<THREE.MeshPhysicalMaterial[]>([]);
  const model = useMemo(() => {
    const root = scene.clone(true);
    skin.current = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const eye = /eye/i.test(m.name);
      const mat = new THREE.MeshPhysicalMaterial({
        color: eye ? '#f2f0ec' : '#c8977f',
        normalMap: src.normalMap ?? null,
        roughness: eye ? 0.15 : 0.55,
        metalness: 0,
        sheen: eye ? 0 : 0.35,
        sheenColor: new THREE.Color('#ffd8c6'),
        sheenRoughness: 0.6,
        clearcoat: eye ? 0.8 : 0.05,
        transparent: true,
        opacity: 1,
      });
      m.material = mat;
      m.renderOrder = 9;
      m.raycast = () => undefined; // taps go to the anatomy underneath
      skin.current.push(mat);
    });
    return root;
  }, [scene]);
  useEffect(() => () => skin.current.forEach((m) => m.dispose()), []);
  useFrame((_, dt) => {
    const goal = open ? 0.22 : 1;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) / 0.08);
    for (const m of skin.current) {
      m.opacity += (goal - m.opacity) * k;
      m.depthWrite = m.opacity > 0.95;
    }
  });
  return <primitive object={model} />;
}

useGLTF.preload(URL, false, true);
