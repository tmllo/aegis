// The 3D body: matte porcelain layers, white skeleton, the five systems tinted by status.
// Click an organ or a label to open that system. Camera glides to the selected system.
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { bodyGeometries, useBody } from '../components/body3d/BodyScene';
import { pickTarget, TARGETS, type TargetId } from '../components/body3d/targets';
import A from '../components/body3d/anchors.json';
import type { Status } from '../data/types';
import type { SystemId } from './state';

const TINT: Record<Status, THREE.Color> = {
  green: new THREE.Color('#5eead4'),
  amber: new THREE.Color('#fbbf24'),
  red: new THREE.Color('#f87171'),
};
const WHITE = new THREE.Color('#eef1f7');
const BLACK = new THREE.Color(0, 0, 0);
const NO_PICK = new Set(['skin', 'muscles', 'lung_left', 'lung_right', 'airways']);

const BASE: Record<string, number> = {
  skin: 0.13,
  muscles: 0,
  muscle_antigravity: 0.0,
  bones: 0.7,
  bones_loadbearing: 0.7,
  arteries: 0.12,
  artery_lad: 0.12,
  veins: 0.07,
  heart: 0.6,
  brain: 0.6,
  eyes: 0.4,
  airways: 0.18,
  organs: 0.4,
  lung_left: 0.16,
  lung_right: 0.16,
};

/** Nodes that carry each system's tint. */
const SYSTEM_NODES: Record<SystemId, string[]> = {
  brain: ['brain'],
  heart: ['heart', 'artery_lad'],
  blood: ['arteries', 'veins', 'organs'],
  bones: ['bones_loadbearing', 'muscle_antigravity'],
  whole_body: ['skin'],
};
const TARGET_SYSTEM: Record<TargetId, SystemId> = {
  heart: 'heart',
  vessels: 'blood',
  brain: 'brain',
  bone: 'bones',
  muscle: 'bones',
  metabolic: 'blood',
  dna: 'whole_body',
};
const SYSTEM_TARGET: Record<SystemId, TargetId> = { brain: 'brain', heart: 'heart', blood: 'metabolic', bones: 'bone', whole_body: 'dna' };

/** Label anchor in model space, and which side the label sits. */
const SPOTS: Record<SystemId, { p: [number, number, number]; side: 'l' | 'r' }> = {
  brain: { p: [A.brain[0] + 0.07, A.brain[1] + 0.05, A.brain[2]], side: 'r' },
  heart: { p: [A.heart[0] + 0.03, A.heart[1], A.heart[2] + 0.07], side: 'r' },
  blood: { p: [0.05, 1.12, 0.08], side: 'l' },
  bones: { p: [0.12, 0.88, 0.05], side: 'r' },
  whole_body: { p: [-0.25, 1.38, 0.04], side: 'l' },
};

function Model({ tint, focus, onPick }: { tint: Record<SystemId, Status>; focus: SystemId | null; onPick: (s: SystemId) => void }) {
  const scene = useBody();
  const geo = useMemo(() => bodyGeometries(scene), [scene]);
  const mats = useMemo(() => {
    const out: Record<string, THREE.MeshStandardMaterial> = {};
    for (const n of Object.keys(geo))
      out[n] = new THREE.MeshStandardMaterial({ color: WHITE.clone(), roughness: n.startsWith('bones') ? 0.6 : 0.5, transparent: true, opacity: BASE[n] ?? 0.3, depthWrite: false });
    return out;
  }, [geo]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const goals = useMemo(() => {
    const g: Record<string, { o: number; c: THREE.Color; top?: boolean; e?: THREE.Color }> = {};
    const focusNodes = new Set(focus ? TARGETS[SYSTEM_TARGET[focus]].nodes : []);
    for (const n of Object.keys(geo)) {
      let o = BASE[n] ?? 0.3;
      if (focus && focus !== 'whole_body') o = focusNodes.has(n) ? 0.95 : n === 'skin' ? 0.05 : n.startsWith('bones') ? 0.25 : Math.min(o, 0.12);
      g[n] = { o, c: WHITE };
    }
    for (const sys of Object.keys(SYSTEM_NODES) as SystemId[]) {
      const s = tint[sys];
      const on = s !== 'green' || sys === focus;
      if (!on) continue;
      for (const n of SYSTEM_NODES[sys]) {
        if (!g[n]) continue;
        if (n === 'skin') {
          g[n] = { o: s === 'green' ? 0.18 : 0.28, c: WHITE.clone().lerp(TINT[s], 0.7), e: TINT[s].clone().multiplyScalar(0.25) };
          continue;
        }
        g[n] = { o: n === 'muscle_antigravity' ? 0.45 : 0.95, c: WHITE.clone().lerp(TINT[s], 0.82), top: s !== 'green', e: TINT[s].clone().multiplyScalar(s === 'green' ? 0.15 : 0.4) };
      }
    }
    return g;
  }, [geo, tint, focus]);

  const meshes = useRef<Record<string, THREE.Mesh | null>>({});
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const heart = meshes.current.heart;
    if (heart) {
      const ph = ((t * 62) / 60) % 1;
      const s = 1 + 0.045 * (ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI * 0.5) : Math.exp(-(ph - 0.15) * 7));
      if (!heart.geometry.boundingBox) heart.geometry.computeBoundingBox();
      const c = heart.geometry.boundingBox!.getCenter(new THREE.Vector3());
      heart.scale.setScalar(s);
      heart.position.copy(c).multiplyScalar(1 - s);
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.05) / 0.09);
    const pulse = 0.75 + 0.25 * Math.sin(t * 3);
    for (const [n, m] of Object.entries(mats)) {
      const goal = goals[n];
      if (!goal) continue;
      m.opacity += (goal.o - m.opacity) * k;
      m.color.lerp(goal.c, k);
      const e = goal.e ? goal.e.clone().multiplyScalar(goal.top ? pulse : 1) : BLACK;
      m.emissive.lerp(e, k);
      const mesh = meshes.current[n];
      if (mesh) mesh.renderOrder = goal.top ? 20 : n === 'skin' ? 10 : n.startsWith('lung') ? 5 : 0;
      m.depthWrite = m.opacity > 0.85;
      m.depthTest = !goal.top;
      m.visible = m.opacity > 0.01;
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4 || !group.current) return;
    for (const hit of e.intersections) {
      const n = hit.object.userData.node as string | undefined;
      if (!n || NO_PICK.has(n) || (mats[n]?.opacity ?? 0) < 0.3) continue;
      const local = group.current.worldToLocal(hit.point.clone());
      const t = pickTarget(n, local, 'all');
      if (t) return onPick(TARGET_SYSTEM[t]);
    }
  };

  return (
    <group ref={group} onClick={click}>
      {Object.entries(geo).map(([n, g]) => (
        <mesh key={n} ref={(m) => void (meshes.current[n] = m)} geometry={g} material={mats[n]} userData={{ node: n }} frustumCulled={false} />
      ))}
    </group>
  );
}

function Labels({ tint, focus, values, onPick }: { tint: Record<SystemId, Status>; focus: SystemId | null; values: Record<SystemId, { name: string; line: string }>; onPick: (s: SystemId) => void }) {
  return (
    <>
      {(Object.keys(SPOTS) as SystemId[]).map((s) => {
        const sp = SPOTS[s];
        const show = !focus || focus === s;
        return (
          <group key={s} position={sp.p}>
            <Html zIndexRange={[30, 0]} style={{ pointerEvents: show ? 'auto' : 'none', opacity: show ? 1 : 0, transition: 'opacity 250ms' }}>
              <button className={`st-hs is-${tint[s]} side-${sp.side}${focus === s ? ' is-on' : ''}`} onClick={() => onPick(s)}>
                <i />
                <span>
                  <b>{values[s].name}</b>
                  <em>{values[s].line}</em>
                </span>
              </button>
            </Html>
          </group>
        );
      })}
    </>
  );
}

type View = { pos: [number, number, number]; target: [number, number, number] };
function viewFor(focus: SystemId | null): View {
  if (!focus || focus === 'whole_body') return { pos: [0, 0.98, 2.7], target: [0, 0.9, 0] };
  const t = TARGETS[SYSTEM_TARGET[focus]];
  const c = t.box.c;
  const d = Math.max(0.75, Math.hypot(...t.box.h) * 4.2);
  return { pos: [c[0] + 0.15, c[1] + 0.05, c[2] + d], target: [c[0], c[1], c[2]] };
}

function Rig({ focus }: { focus: SystemId | null }) {
  const ctl = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef<{ p: THREE.Vector3; t: THREE.Vector3; on: boolean }>({ p: new THREE.Vector3(), t: new THREE.Vector3(), on: false });
  useEffect(() => {
    const v = viewFor(focus);
    goal.current = { p: new THREE.Vector3(...v.pos), t: new THREE.Vector3(...v.target), on: true };
  }, [focus]);
  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    const stop = () => (goal.current.on = false);
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, []);
  useFrame((_, dt) => {
    const g = goal.current;
    const c = ctl.current;
    if (!g.on || !c) return;
    const k = 1 - Math.exp(-dt * 3.4);
    c.target.lerp(g.t, k);
    camera.position.lerp(g.p, k);
    c.update();
    if (camera.position.distanceTo(g.p) < 0.002 && c.target.distanceTo(g.t) < 0.002) g.on = false;
  });
  return <OrbitControls ref={ctl} target={viewFor(focus).target} makeDefault enablePan={false} minDistance={0.4} maxDistance={4.5} enableDamping dampingFactor={0.08} minPolarAngle={0.5} maxPolarAngle={2.4} />;
}

/** Radiation streaks across the body when the station is under a storm warning. */
function Particles({ on }: { on: boolean }) {
  const N = 700;
  const ref = useRef<THREE.LineSegments>(null);
  const { pos, seeds } = useMemo(() => {
    const s = new Float32Array(N * 3);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    return { pos: new Float32Array(N * 6), seeds: s };
  }, []);
  const level = useRef(0);
  useFrame(({ clock }, dt) => {
    level.current += ((on ? 1 : 0) - level.current) * (1 - Math.exp(-dt * 2));
    const g = ref.current?.geometry;
    if (!g) return;
    const n = Math.floor(N * level.current);
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const a = seeds[i * 3];
      const b = seeds[i * 3 + 1];
      const c = seeds[i * 3 + 2];
      const along = ((t * (0.8 + c) + a * 3) % 3) - 1.5;
      const x = 0.9 * along + (b - 0.5) * 0.3;
      const y = 0.95 + (a - 0.5) * 1.8 - along * 0.3;
      const z = (c - 0.5) * 0.5 + along * 0.5;
      pos.set([x, y, z, x - 0.06, y + 0.02, z - 0.03], i * 6);
    }
    g.setDrawRange(0, n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#fca5a5" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

export default function BodyCanvas({
  tint,
  focus,
  values,
  onPick,
  storm = false,
}: {
  tint: Record<SystemId, Status>;
  focus: SystemId | null;
  values: Record<SystemId, { name: string; line: string }>;
  onPick: (s: SystemId) => void;
  storm?: boolean;
}) {
  const v0 = viewFor(focus);
  return (
    <Canvas dpr={[1, 1.6]} camera={{ position: v0.pos, fov: 34, near: 0.01, far: 50 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-2, 4, 3]} intensity={2.2} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.8} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#dfe8ff" />
        <Lightformer form="rect" intensity={0.6} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#bfe8f0" />
      </Environment>
      <Suspense
        fallback={
          <Html center>
            <p className="st-muted">Loading body model…</p>
          </Html>
        }
      >
        <Model tint={tint} focus={focus} onPick={onPick} />
        <Labels tint={tint} focus={focus} values={values} onPick={onPick} />
      </Suspense>
      <Particles on={storm} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={2.2} blur={2.4} far={1.2} frames={1} />
      <Rig focus={focus} />
    </Canvas>
  );
}
