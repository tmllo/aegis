// The 3D body: matte porcelain layers, white skeleton, the five systems tinted by status; a view switch shows
// the whole body, the suit, or one layer alone.
// Click an organ or a label to open that system. Camera glides to the selected system.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { bodyGeometries, NODE_LAYER, useBody, type Layers } from '../components/body3d/BodyScene';
import { pickTarget, TARGETS, type TargetId } from '../components/body3d/targets';
import A from '../components/body3d/anchors.json';
import type { Status } from '../data/types';
import type { SystemId } from './state';

// Emile: parts that need care light up in red (amber and red both); healthy parts stay bone. Two colours
// only in the UI (16 Nov): blue for selection, red for care.
const CARE = new THREE.Color('#ff3b4e');
const TINT: Record<Status, THREE.Color> = {
  green: new THREE.Color('#8fb0ff'), // an open healthy system lights blue (selection), never green
  amber: CARE,
  red: CARE,
};
const WHITE = new THREE.Color('#eef1f7');
const BONE = new THREE.Color('#e6d9bf');
const BONE_LIGHT = new THREE.Color('#d6c29b');
const SHELL_LIGHT = new THREE.Color('#8f99b3');
const BLACK = new THREE.Color(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const NO_PICK = new Set(['skin', 'muscles', 'lung_left', 'lung_right', 'airways']);

const BASE: Record<string, number> = {
  skin: 0.06,
  muscles: 0,
  muscle_antigravity: 0.0,
  bones: 1,
  bones_loadbearing: 1,
  arteries: 0.1,
  artery_lad: 0.1,
  veins: 0.05,
  heart: 0.55,
  brain: 0.55,
  eyes: 0.35,
  airways: 0.12,
  organs: 0.3,
  lung_left: 0.1,
  lung_right: 0.1,
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

/** One view at a time (Emile, 16 Nov): the whole body, the suit alone, or one layer on its own.
 *  Skin and muscles are not shown in any view. */
export type BodyView = 'body' | 'suit' | 'skeleton' | 'vessels' | 'organs';
const HIDDEN = new Set(['skin', 'muscles', 'muscle_antigravity']);
/** The layer each view isolates, drawn near-solid; bones stay as a faint frame for place. */
const SOLO: Partial<Record<BodyView, { layer: keyof Layers; o: number }>> = {
  skeleton: { layer: 'skeleton', o: 1 },
  vessels: { layer: 'vessels', o: 0.92 },
  organs: { layer: 'organs', o: 0.9 },
};

function Model({ tint, focus, onPick, bone, view }: { tint: Record<SystemId, Status>; focus: SystemId | null; onPick: (s: SystemId) => void; bone: THREE.Color; view: BodyView }) {
  const scene = useBody();
  const geo = useMemo(() => bodyGeometries(scene), [scene]);
  const mats = useMemo(() => {
    const out: Record<string, THREE.MeshStandardMaterial> = {};
    for (const n of Object.keys(geo))
      out[n] = n.startsWith('bones')
        ? // bone: warm ivory, matte with a faint waxy sheen, like a museum specimen under studio light
          new THREE.MeshPhysicalMaterial({ color: BONE.clone(), roughness: 0.62, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff4e0'), clearcoat: 0.08, clearcoatRoughness: 0.5, transparent: true, opacity: BASE[n] ?? 1, depthWrite: true })
        : new THREE.MeshStandardMaterial({ color: WHITE.clone(), roughness: 0.5, transparent: true, opacity: BASE[n] ?? 0.3, depthWrite: false });
    return out;
  }, [geo]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  // hover: the system under the pointer lights up before the click, so the body reads as touchable
  const [hover, setHover] = useState<SystemId | null>(null);
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : '';
    return () => void (document.body.style.cursor = '');
  }, [hover]);

  const goals = useMemo(() => {
    const g: Record<string, { o: number; c: THREE.Color; top?: boolean; e?: THREE.Color }> = {};
    const focusNodes = new Set(focus ? TARGETS[SYSTEM_TARGET[focus]].nodes : []);
    for (const n of Object.keys(geo)) {
      let o = BASE[n] ?? 0.3;
      if (focus && focus !== 'whole_body') o = focusNodes.has(n) ? 0.95 : n === 'skin' ? 0.05 : n.startsWith('bones') ? 0.25 : Math.min(o, 0.12);
      g[n] = { o, c: n.startsWith('bones') ? bone : bone === BONE_LIGHT ? SHELL_LIGHT : WHITE };
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
        g[n] = { o: n === 'muscle_antigravity' ? 0.45 : 0.95, c: (n.startsWith('bones') ? bone : WHITE).clone().lerp(TINT[s], s === 'green' ? 0.5 : 0.55), top: s !== 'green', e: TINT[s].clone().multiplyScalar(s === 'green' ? 0.12 : 0.55) };
      }
    }
    if (hover && hover !== focus)
      for (const n of SYSTEM_NODES[hover]) {
        if (!g[n] || n === 'skin') continue;
        const c = TINT[tint[hover]];
        g[n] = { o: Math.max(g[n].o, n === 'muscle_antigravity' ? 0.5 : 0.9), c: WHITE.clone().lerp(c, 0.6), top: true, e: c.clone().multiplyScalar(0.55) };
      }
    // views: skin and muscles never show; the suit hides the whole body (nothing glows through it);
    // a layer view draws that layer near-solid over a faint skeleton, and keeps flagged or open systems
    const solo = SOLO[view];
    for (const n of Object.keys(g)) {
      const layer = NODE_LAYER[n]?.layer;
      if (HIDDEN.has(n) || view === 'suit') {
        g[n] = { ...g[n], o: 0, top: false, e: undefined };
        continue;
      }
      if (!solo) continue;
      const keep = g[n].top || focusNodes.has(n);
      if (layer === solo.layer) g[n] = { ...g[n], o: Math.max(g[n].o, solo.o) };
      else if (keep) continue;
      else if (layer === 'skeleton') g[n] = { ...g[n], o: 0.14 };
      else g[n] = { ...g[n], o: 0 };
    }
    return g;
  }, [geo, tint, focus, hover, bone, view]);

  const meshes = useRef<Record<string, THREE.Mesh | null>>({});
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const heart = meshes.current.heart;
    if (heart && !REDUCE) {
      const ph = ((t * 62) / 60) % 1;
      const s = 1 + 0.045 * (ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI * 0.5) : Math.exp(-(ph - 0.15) * 7));
      if (!heart.geometry.boundingBox) heart.geometry.computeBoundingBox();
      const c = heart.geometry.boundingBox!.getCenter(new THREE.Vector3());
      heart.scale.setScalar(s);
      heart.position.copy(c).multiplyScalar(1 - s);
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.05) / 0.09);
    const pulse = REDUCE ? 1 : 0.7 + 0.3 * Math.sin(t * 1.8);
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

  const systemAt = (e: ThreeEvent<PointerEvent | MouseEvent>): SystemId | null => {
    if (!group.current) return null;
    for (const hit of e.intersections) {
      const n = hit.object.userData.node as string | undefined;
      if (!n || NO_PICK.has(n) || (mats[n]?.opacity ?? 0) < 0.3) continue;
      const t = pickTarget(n, group.current.worldToLocal(hit.point.clone()), 'all');
      if (t) return TARGET_SYSTEM[t];
    }
    return null;
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return;
    const sys = systemAt(e);
    if (sys) onPick(sys);
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const sys = systemAt(e);
    if (sys !== hover) setHover(sys);
  };

  return (
    <group ref={group} onClick={click} onPointerMove={move} onPointerOut={() => setHover(null)}>
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
        // a quiet body: only flagged or selected systems carry a text label; the others are a dot to tap
        const text = tint[s] !== 'green' || focus === s;
        if (!values[s]) return null;
        return (
          <group key={s} position={sp.p}>
            <Html zIndexRange={[30, 0]} style={{ pointerEvents: show ? 'auto' : 'none', opacity: show ? 1 : 0, transition: 'opacity 250ms' }}>
              <button className={`st-hs is-${tint[s]} side-${sp.side}${focus === s ? ' is-on' : ''}${text ? '' : ' is-dot'}`} onClick={() => onPick(s)} aria-label={`${values[s].name} ${values[s].line}`}>
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

/** Apollo 11 A7L suit: the Smithsonian's 3D scan (CC0), stood up at real size on the body's floor with the
 *  agency patches, flag and name tag painted out (docs/body-kit/fit_a7l_suit.py). Fetched the first time
 *  the Suit view is chosen, then fades in and out; the body is hidden behind it. */
const SUIT_URL = import.meta.env.VITE_SUIT_URL ?? '/models/suit.glb';
function Suit({ on }: { on: boolean }) {
  const { scene } = useGLTF(SUIT_URL, false) as { scene: THREE.Group };
  const mats = useMemo(() => {
    const out: THREE.MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.raycast = () => {}; // clicks pass through the suit to the body systems inside
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.envMapIntensity = 0.9;
      mat.opacity = 0;
      out.push(mat);
    });
    return out;
  }, [scene]);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) / 0.12);
    for (const m of mats) {
      m.opacity += ((on ? 1 : 0) - m.opacity) * k;
      m.transparent = m.opacity < 0.99;
      m.depthWrite = m.opacity > 0.5;
      m.visible = m.opacity > 0.01;
    }
  });
  return <primitive object={scene} />;
}

type View = { pos: [number, number, number]; target: [number, number, number] };
// The whole body stays in view (Emile): a selected system is highlighted and labelled, not zoomed into.
function viewFor(_focus: SystemId | null): View {
  // start close (Emile, 16 Nov): the body fills the stage, head to feet
  return { pos: [0, 0.9, 3.05], target: [0, 0.86, 0] };
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
  // time-based idle orbit (one turn in about 50 s, same speed at any frame rate)
  const idleRef = useRef(true);
  const off = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const c = ctl.current;
    if (!c || !idleRef.current || REDUCE || goal.current.on) return;
    off.current.copy(camera.position).sub(c.target).applyAxisAngle(UP, Math.min(dt, 0.1) * 0.125);
    camera.position.copy(c.target).add(off.current);
    c.update();
  });
  // idle: the camera circles the body slowly so every side (and every part in soft red) comes into view;
  // it stops while someone drags or a system is open, and resumes 4 s after the last touch
  const [idle, setIdle] = useState(true);
  useEffect(() => void (idleRef.current = idle), [idle]);
  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    let tm = 0;
    const start = () => (window.clearTimeout(tm), setIdle(false));
    const end = () => (tm = window.setTimeout(() => setIdle(true), 4000));
    c.addEventListener('start', start);
    c.addEventListener('end', end);
    return () => (window.clearTimeout(tm), c.removeEventListener('start', start), c.removeEventListener('end', end));
  }, []);
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

/** The app theme (light / dark) from the station root, live: the body is lit and backed to match the page. */
function usePageTheme(): 'light' | 'dark' {
  const read = () => ((document.querySelector('.st[data-theme]') as HTMLElement | null)?.dataset.theme === 'dark' ? 'dark' : 'light');
  const [t, setT] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const el = document.querySelector('.st[data-theme]');
    if (!el) return;
    const mo = new MutationObserver(() => setT(read()));
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return t;
}

export default function BodyCanvas({
  tint,
  focus,
  values,
  onPick,
  storm = false,
  view = 'body',
}: {
  tint: Record<SystemId, Status>;
  focus: SystemId | null;
  values: Record<SystemId, { name: string; line: string }>;
  onPick: (s: SystemId) => void;
  storm?: boolean;
  view?: BodyView;
}) {
  const v0 = viewFor(focus);
  const theme = usePageTheme();
  const light = theme === 'light';
  // the suit model downloads only once someone asks for it
  const [suitWanted, setSuitWanted] = useState(view === 'suit');
  useEffect(() => void (view === 'suit' && setSuitWanted(true)), [view]);
  return (
    <Canvas dpr={[1, 1.6]} camera={{ position: v0.pos, fov: 34, near: 0.01, far: 50 }} gl={{ antialias: true, alpha: true }}>
      {/* the body sits on the page itself: same background colour, no panel */}
      <hemisphereLight args={['#f4efe6', light ? '#8d93a8' : '#1a1f3a', light ? 0.6 : 0.45]} />
      <directionalLight position={[-2, 4, 3]} intensity={light ? 1.7 : 2.4} color="#fff3e2" />
      <directionalLight position={[2.5, 2, -3]} intensity={light ? 1.1 : 1.6} color="#c9dcff" />
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
        <Model tint={tint} focus={focus} onPick={onPick} bone={light ? BONE_LIGHT : BONE} view={view} />
        <Labels tint={tint} focus={focus} values={values} onPick={onPick} />
      </Suspense>
      {suitWanted && (
        <Suspense
          fallback={
            <Html center>
              <p className="st-muted">Loading suit…</p>
            </Html>
          }
        >
          <Suit on={view === 'suit'} />
        </Suspense>
      )}
      <Particles on={storm} />
      <ContactShadows position={[0, 0.002, 0]} opacity={light ? 0.3 : 0.45} scale={2.2} blur={2.4} far={1.2} frames={1} color={light ? '#3a4060' : '#000000'} />
      <Rig focus={focus} />
    </Canvas>
  );
}
