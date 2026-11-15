// Body model loader: the one swap point for the 3D body.
// A new GLB needs public/models/<file>.glb and an edit to model-map.json. Nothing else.
// Anatomy (current model): BodyParts3D 4.0 (c) Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MetricKey, Region } from '../../../data/types';
import modelMap from './model-map.json';

/** Render layers the body screen knows how to draw. */
export type Layer = 'whole_body' | 'brain' | 'heart' | 'blood' | 'bones' | 'bones_loadbearing' | 'muscle_antigravity';
export type Vec3 = [number, number, number];

interface ModelMap {
  url: string;
  structureRanges: boolean;
  nodes: Record<string, { layer: Layer; region: Region }>;
  anchors: Partial<Record<MetricKey, Vec3>>;
}
const map = modelMap as unknown as ModelMap;

export const MODEL_URL = `${import.meta.env.BASE_URL}${map.url}`;
/** true: docs/body-map.json triangle ranges match this model, so single structures can be painted. */
export const STRUCTURE_RANGES = map.structureRanges;
/** Per-metric anchor overrides for a model that is not the one body-map.json was measured on. */
export const ANCHOR_OVERRIDES = map.anchors;

export type BodyGeometry = Partial<Record<Layer, THREE.BufferGeometry>>;

/** The layer of a mesh: its own name, else the nearest named ancestor in the map. */
function layerOf(o: THREE.Object3D): Layer | null {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) {
    const hit = map.nodes[n.name];
    if (hit) return hit.layer;
  }
  return null;
}

/** Position + normal + index only, in world space, so meshes of one layer can be merged. */
function normalised(mesh: THREE.Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const src = mesh.geometry;
  g.setAttribute('position', src.attributes.position.clone());
  if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
  else g.computeVertexNormals();
  const n = src.attributes.position.count;
  g.setIndex(src.index ? src.index.clone() : Array.from({ length: n }, (_, i) => i));
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

function collect(scene: THREE.Object3D): BodyGeometry {
  scene.updateMatrixWorld(true);
  const parts = new Map<Layer, THREE.Mesh[]>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const layer = layerOf(mesh);
    if (!layer) return;
    parts.set(layer, [...(parts.get(layer) ?? []), mesh]);
  });
  const out: BodyGeometry = {};
  for (const [layer, meshes] of parts) {
    const only = meshes.length === 1 ? meshes[0] : null;
    if (only && only.matrixWorld.equals(new THREE.Matrix4()) && only.geometry.index && only.geometry.attributes.normal) {
      // Untouched: keeps the triangle order that the body-map structure ranges index into.
      out[layer] = only.geometry;
    } else {
      const merged = mergeGeometries(meshes.map(normalised));
      if (merged) {
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        out[layer] = merged;
      }
    }
  }
  return out;
}

/** Loads the body GLB (cached by drei) and returns one geometry per layer. */
export function useBodyModel(): BodyGeometry {
  const { scene } = useGLTF(MODEL_URL);
  return useMemo(() => collect(scene), [scene]);
}

export const preloadBodyModel = (): void => useGLTF.preload(MODEL_URL);
