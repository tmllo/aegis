// The body as a clean matte porcelain model (geometry from body v2, none of its shaders):
// faint translucent white layers, opaque white skeleton, and a soft steady tint on the
// affected organ only. Diving in fades the outer layers; 180 ms fades, nothing else moves.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { bodyGeometries, useBody } from '../components/body3d/BodyScene';
import { pickTarget, TARGETS, type TargetId } from '../components/body3d/targets';
import type { Status } from '../data/types';
import { useHud, type Layer } from './hud';

/** The node that carries a target's status tint. */
export const TINT_NODE: Partial<Record<TargetId, string>> = {
  heart: 'heart',
  vessels: 'arteries',
  brain: 'brain',
  bone: 'bones_loadbearing',
  muscle: 'muscle_antigravity',
  metabolic: 'organs',
};

const TINT: Record<Status, THREE.Color> = {
  green: new THREE.Color('#3fa9ff'),
  amber: new THREE.Color('#f5a623'),
  red: new THREE.Color('#ef4444'),
};
const WHITE = new THREE.Color('#f2f4fa');
const NO_PICK = new Set(['skin', 'muscles', 'lung_left', 'lung_right', 'airways']);
const LAYER_OF: Record<string, Layer> = {
  skin: 'skin',
  muscles: 'muscle',
  muscle_antigravity: 'muscle',
  bones: 'skeleton',
  bones_loadbearing: 'skeleton',
};
const HOVER = new THREE.Color('#5fd3d6');

/** Resting opacity of each layer in the whole-body view. */
const BASE: Record<string, number> = {
  skin: 0.16,
  muscles: 0,
  muscle_antigravity: 0,
  bones: 0.9,
  bones_loadbearing: 0.9,
  arteries: 0.1,
  artery_lad: 0.1,
  veins: 0.06,
  heart: 0.6,
  brain: 0.6,
  eyes: 0.5,
  airways: 0.2,
  organs: 0.42,
  lung_left: 0.18,
  lung_right: 0.18,
};

export function Porcelain({
  focus,
  tint,
  onPick,
  onReady,
  near = false,
}: {
  near?: boolean;
  focus: TargetId | null;
  /** target -> status; tinted only when not green, plus the focused one. */
  tint: Partial<Record<TargetId, Status>>;
  onPick: (t: TargetId) => void;
  onReady?: () => void;
}) {
  const scene = useBody();
  const layers = useHud((s) => s.layers);
  const hover = useHud((s) => s.hover);
  const setHover = useHud((s) => s.setHover);
  const geo = useMemo(() => bodyGeometries(scene), [scene]);
  const mats = useMemo(() => {
    const out: Record<string, THREE.MeshStandardMaterial> = {};
    for (const n of Object.keys(geo)) {
      out[n] = new THREE.MeshStandardMaterial({ color: WHITE.clone(), roughness: n.startsWith('bones') ? 0.62 : 0.5, metalness: 0, transparent: true, opacity: BASE[n] ?? 0.3, depthWrite: false });
    }
    return out;
  }, [geo]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // goals for each node
  const goals = useMemo(() => {
    const g: Record<string, { o: number; c: THREE.Color }> = {};
    const inFocus = new Set(focus ? TARGETS[focus].nodes : []);
    for (const n of Object.keys(geo)) {
      let o = BASE[n] ?? 0.3;
      if (near && !focus && n === 'skin') o = 0.04;
      if (focus) o = inFocus.has(n) ? 0.96 : n === 'skin' ? 0.05 : n.startsWith('bones') ? 0.22 : Math.min(o, 0.1);
      g[n] = { o, c: WHITE };
    }
    for (const [t, s] of Object.entries(tint) as [TargetId, Status][]) {
      const n = TINT_NODE[t];
      if (!n || !g[n] || (s === 'green' && t !== focus)) continue;
      g[n] = { o: Math.max(g[n].o, 0.9), c: WHITE.clone().lerp(TINT[s], 0.55) };
    }
    for (const n of Object.keys(g)) {
      if (!layers[LAYER_OF[n] ?? 'organs']) g[n] = { ...g[n], o: 0 };
    }
    if (hover && g[hover.node] && g[hover.node].o > 0.05) g[hover.node] = { o: Math.max(g[hover.node].o, 0.75), c: g[hover.node].c.clone().lerp(HOVER, 0.35) };
    return g;
  }, [geo, focus, tint, layers, hover, near]);

  const reduced = useRef(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useFrame((_, dt) => {
    const k = reduced.current ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) / 0.06); // about 180 ms
    for (const [n, m] of Object.entries(mats)) {
      const goal = goals[n];
      if (!goal) continue;
      m.opacity += (goal.o - m.opacity) * k;
      m.color.lerp(goal.c, k);
      m.depthWrite = m.opacity > 0.85;
      m.visible = m.opacity > 0.01;
    }
  });

  const group = useRef<THREE.Group>(null);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4 || !group.current) return;
    for (const hit of e.intersections) {
      const n = hit.object.userData.node as string | undefined;
      if (!n || NO_PICK.has(n) || (mats[n]?.opacity ?? 0) < 0.3) continue;
      const local = group.current.worldToLocal(hit.point.clone());
      const t = pickTarget(n, local, focus ? TARGETS[focus].lens : 'all');
      if (t) return onPick(t);
    }
  };

  return (
    <group
      ref={group}
      onClick={click}
      onDoubleClick={click}
      onPointerMove={(e) => {
        const hit = e.intersections.find((h) => {
          const n = h.object.userData.node as string | undefined;
          return n && !NO_PICK.has(n) && (mats[n]?.opacity ?? 0) > 0.3;
        });
        const n = hit?.object.userData.node as string | undefined;
        if ((n ?? null) !== (hover?.node ?? null) || n) setHover(n ? { node: n, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : null);
      }}
      onPointerOut={() => setHover(null)}
    >
      {Object.entries(geo).map(([n, g]) => (
        <mesh key={n} geometry={g} material={mats[n]} userData={{ node: n }} renderOrder={n === 'skin' ? 10 : n.startsWith('lung') ? 5 : 0} frustumCulled={false} />
      ))}
    </group>
  );
}
