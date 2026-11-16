// The 3D body: matte porcelain layers, white skeleton, the five systems tinted by status; a view switch shows
// the whole body, the suit, or one layer alone.
// Click an organ or a label to open that system. Camera glides to the selected system.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import dracoWasm from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import dracoWrapper from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { bodyGeometries, NODE_LAYER, useBody, type Layers } from '../components/body3d/BodyScene';
import { pickTarget, TARGETS, type TargetId } from '../components/body3d/targets';
import A from '../components/body3d/anchors.json';
import type { Status } from '../data/types';
import { spin, SPIN_SPEED } from './spin';
import type { SystemId } from './state';

// Emile: parts that need care light up in red (amber and red both); healthy parts stay bone. Two colours
// only in the UI (16 Nov): blue for selection, red for care.
const CARE = new THREE.Color('#ff3b4e');
const TINT: Record<Status, THREE.Color> = {
  green: new THREE.Color('#ffffff'), // an open healthy system lights white (selection), never blue or green
  amber: CARE,
  red: CARE,
};
const WHITE = new THREE.Color('#eef1f7');
const BONE = new THREE.Color('#e6d9bf');
const BONE_LIGHT = new THREE.Color('#d6c29b');
const SHELL_LIGHT = new THREE.Color('#8f99b3');
const BLACK = new THREE.Color(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const TMP_V = new THREE.Vector3();
const TMP_C = new THREE.Color();
const NO_RAY = () => {};
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
          new THREE.MeshStandardMaterial({ color: BONE.clone(), roughness: 0.6, metalness: 0, envMapIntensity: 1.1, transparent: true, opacity: BASE[n] ?? 1, depthWrite: true })
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
      // with a system open, only that system is lit; flagged parts elsewhere wait until you go back (Emile, 16 Nov)
      const on = focus && focus !== 'whole_body' ? sys === focus : s !== 'green' || sys === focus;
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
  const warm = useRef(0);
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const heart = meshes.current.heart;
    if (heart && !REDUCE) {
      const ph = ((t * 62) / 60) % 1;
      const s = 1 + 0.045 * (ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI * 0.5) : Math.exp(-(ph - 0.15) * 7));
      if (!heart.geometry.boundingBox) heart.geometry.computeBoundingBox();
      const c = heart.geometry.boundingBox!.getCenter(TMP_V);
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
      const e = goal.e ? TMP_C.copy(goal.e).multiplyScalar(goal.top ? pulse : 1) : BLACK;
      m.emissive.lerp(e, k);
      const mesh = meshes.current[n];
      if (mesh) mesh.renderOrder = goal.top ? 20 : n === 'skin' ? 10 : n.startsWith('lung') ? 5 : 0;
      m.depthWrite = m.opacity > 0.85;
      m.depthTest = !goal.top;
      // the first frames draw every layer once (invisible) so its geometry is on the GPU before anyone
      // switches to it; afterwards hidden layers are skipped
      m.visible = warm.current < 3 || m.opacity > 0.01;
    }
    warm.current++;
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
  const lastMove = useRef(0);
  const move = (e: ThreeEvent<PointerEvent>) => {
    const now = performance.now();
    if (now - lastMove.current < 60) return;
    lastMove.current = now;
    const sys = systemAt(e);
    if (sys !== hover) setHover(sys);
  };

  return (
    <group ref={group} onClick={click} onPointerMove={move} onPointerOut={() => setHover(null)}>
      {Object.entries(geo).map(([n, g]) => (
        <mesh key={n} ref={(m) => void (meshes.current[n] = m)} geometry={g} material={mats[n]} userData={{ node: n }} frustumCulled={false} raycast={NO_PICK.has(n) ? NO_RAY : undefined} />
      ))}
    </group>
  );
}

function Labels({ tint, focus, values, onPick }: { tint: Record<SystemId, Status>; focus: SystemId | null; values: Record<SystemId, { name: string; line: string }>; onPick: (s: SystemId) => void }) {
  return (
    <>
      {(Object.keys(SPOTS) as SystemId[]).map((s) =>
        values[s] ? <Label key={s} s={s} tint={tint[s]} focus={focus} value={values[s]} onPick={onPick} /> : null,
      )}
    </>
  );
}

/** Safe frame for labels (normalised screen units): clear of the canvas edges and the view switch below. */
const SAFE = { top: 0.9, bottom: -0.62 };

// Emile (16 Nov): every system carries its name and value on the body; with a system open, the others stay
// visible and one tap away (quieter), and a label whose part is out of frame hides instead of being cut off
function Label({ s, tint, focus, value, onPick }: { s: SystemId; tint: Status; focus: SystemId | null; value: { name: string; line: string }; onPick: (s: SystemId) => void }) {
  const sp = SPOTS[s];
  const quiet = !!focus && focus !== s;
  const g = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const p = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();
  const inFrame = useRef(true);
  useFrame(() => {
    if (!g.current || !box.current) return;
    g.current.getWorldPosition(p).project(camera);
    // the label must sit fully on screen (its own width, shorter on phones) and clear of the switch below
    const btn = box.current.firstElementChild as HTMLElement | null;
    const r = btn?.getBoundingClientRect();
    const onScreen = !r || (r.left >= 4 && r.right <= window.innerWidth - 4);
    // the open system's label always shows: if it runs off one edge, it switches to the other side of its dot
    if (focus === s && btn && r) {
      if (r.right > window.innerWidth - 4 && btn.classList.contains('side-r')) btn.classList.replace('side-r', 'side-l');
      else if (r.left < 4 && btn.classList.contains('side-l')) btn.classList.replace('side-l', 'side-r');
    }
    // never on top of the view switch (top of the stage on phones, bottom on desktop)
    const sw = document.querySelector('.ds-views')?.getBoundingClientRect();
    const clear = !r || !sw || r.bottom < sw.top - 4 || r.top > sw.bottom + 4 || r.right < sw.left || r.left > sw.right;
    const ok = (focus === s && clear) || (onScreen && clear && p.y < SAFE.top && p.y > SAFE.bottom);
    if (ok === inFrame.current) return;
    inFrame.current = ok;
    box.current.style.opacity = ok ? (quiet ? '0.6' : '1') : '0';
    box.current.style.pointerEvents = ok ? 'auto' : 'none';
  });
  useEffect(() => {
    if (box.current && inFrame.current) box.current.style.opacity = quiet ? '0.6' : '1';
  }, [quiet]);
  return (
    <group ref={g} position={sp.p}>
      <Html zIndexRange={[30, 0]}>
        <div ref={box} style={{ opacity: quiet ? 0.6 : 1, transition: 'opacity 250ms ease-out' }}>
          <button className={`st-hs is-${tint} side-${sp.side}${focus === s ? ' is-on' : ''}`} onClick={() => onPick(s)} aria-label={`${value.name} ${value.line}`}>
            <i />
            <span>
              <b>{value.name}</b>
              <em>{value.line}</em>
            </span>
          </button>
        </div>
      </Html>
    </group>
  );
}

/** EVA spacesuit (EMU): NASA 3D Resources model, cleaned, stood over this skeleton (head in the helmet, arms
 *  lowered onto the skeleton's arms, soles on the floor) with fabric, metal and visor materials and baked AO, no flags
 *  or agency patches (blender-assets/_scripts/suit-emu-nasa). Fetched the first time the Suit view is chosen. */
const SUIT_URL = import.meta.env.VITE_SUIT_URL ?? '/models/suit.glb';
// The suit is Draco-compressed (5.8 MB -> 2.1 MB). The decoder ships inside the app build (no outside server,
// so it still works offline): the loader is pointed at the bundled files instead of a decoder folder.
class LocalDraco extends DRACOLoader {
  _loadLibrary(url: string, responseType: string) {
    const file = url === 'draco_decoder.wasm' ? dracoWasm : url === 'draco_wasm_wrapper.js' ? dracoWrapper : url;
    const loader = new THREE.FileLoader(this.manager);
    loader.setResponseType(responseType);
    return new Promise((resolve, reject) => loader.load(file, resolve, undefined, reject));
  }
}
const draco = new LocalDraco();
const withDraco = (loader: { setDRACOLoader: (d: DRACOLoader) => void }) => loader.setDRACOLoader(draco);
useGLTF.preload(SUIT_URL, false, true, withDraco as never); // the page opens on the suit: start the download with the app
function Suit({ on }: { on: boolean }) {
  const { scene } = useGLTF(SUIT_URL, false, true, withDraco as never) as unknown as { scene: THREE.Group };
  const { gl, camera } = useThree();
  // upload textures and compile shaders before the first visible frame, then fade in: no hitch in the turn
  const ready = useRef(false);
  useEffect(() => {
    let live = true;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m) return;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) gl.initTexture(t);
    });
    const vis: THREE.Material[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !m.visible) (m.visible = true), vis.push(m);
    });
    gl.compileAsync(scene, camera).finally(() => {
      for (const m of vis) m.visible = false;
      if (live) ready.current = true;
    });
    return () => void (live = false);
  }, [scene, gl, camera]);
  // the visor mirrors the Earth backdrop the crew member stands in front of
  const earth = useLoader(THREE.TextureLoader, '/space/earth-iss.jpg');
  const mats = useMemo(() => {
    earth.mapping = THREE.EquirectangularReflectionMapping;
    earth.colorSpace = THREE.SRGBColorSpace;
    const out: THREE.MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.raycast = () => {}; // clicks pass through the suit to the body systems inside
      const mat = m.material as THREE.MeshStandardMaterial;
      // the mirror visor and metal parts need the environment to read as glass and metal
      if (mat.name === 'suit_visor') {
        mat.envMap = earth;
        mat.envMapIntensity = 1.6;
      } else mat.envMapIntensity = mat.metalness > 0.5 ? 1.4 : 1;
      mat.opacity = 0;
      out.push(mat);
    });
    return out;
  }, [scene, earth]);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) / 0.12);
    for (const m of mats) {
      m.opacity += ((on && ready.current ? 1 : 0) - m.opacity) * k;
      m.transparent = m.opacity < 0.99;
      m.depthWrite = m.opacity > 0.5;
      m.visible = m.opacity > 0.01;
    }
  });
  return (
    <>
      <primitive object={scene} />
      {/* sunlight for the white suit only: a warm hard key from the upper left, as in orbit */}
      <directionalLight position={[-2.6, 3.2, 3.6]} intensity={on ? 1.1 : 0} color="#fff4e6" />
    </>
  );
}

type View = { pos: [number, number, number]; target: [number, number, number] };
// Emile (16 Nov, 13:58): the whole figure with air around it, the suit's boots clear of the view switch
const WHOLE: View = { pos: [0, 0.96, 4.3], target: [0, 0.92, 0] };
// Emile (16 Nov, 14:40): opening a system flies the camera to that part, seen from the front
const ZOOM: Partial<Record<SystemId, View>> = {
  brain: { pos: [0, 1.64, 1.3], target: [0, 1.6, 0] },
  heart: { pos: [0.02, 1.32, 1.5], target: [0.02, 1.29, 0.02] },
  blood: { pos: [0, 1.18, 1.75], target: [0, 1.14, 0] },
  bones: { pos: [0, 0.95, 3.1], target: [0, 0.9, 0] },
};
function viewFor(focus: SystemId | null): View {
  return (focus && ZOOM[focus]) || WHOLE;
}

function Rig({ focus, cam }: { focus: SystemId | null; cam: View | null }) {
  const ctl = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef<{ p: THREE.Vector3; t: THREE.Vector3; on: boolean }>({ p: new THREE.Vector3(), t: new THREE.Vector3(), on: false });
  // after a part is opened the body holds still a moment, then keeps turning slowly (Emile, 16 Nov)
  const pauseUntil = useRef(0);
  useEffect(() => {
    const v = cam ?? viewFor(focus);
    const t = new THREE.Vector3(...v.target);
    const zoom = !!cam || !!(focus && ZOOM[focus]);
    if (zoom) spin.a = 0; // a zoomed part is always seen from the front
    const p = new THREE.Vector3(...v.pos).sub(t).applyAxisAngle(UP, spin.a).add(t); // otherwise keep the shared angle
    goal.current = { p, t, on: true };
    if (zoom) pauseUntil.current = performance.now() + 4000;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, cam && cam.pos.join(), cam && cam.target.join()]);
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
    if (!c || goal.current.on) return;
    off.current.copy(camera.position).sub(c.target);
    if (!idleRef.current || REDUCE || performance.now() < pauseUntil.current) {
      spin.a = Math.atan2(off.current.x, off.current.z); // dragging: the shared angle follows the camera
      return;
    }
    spin.a += Math.min(dt, 0.1) * SPIN_SPEED;
    const r = Math.hypot(off.current.x, off.current.z);
    camera.position.set(c.target.x + r * Math.sin(spin.a), c.target.y + off.current.y, c.target.z + r * Math.cos(spin.a));
    c.update();
  });
  // idle: the camera circles the body slowly so every side (and every part in soft red) comes into view;
  // it stops while someone drags and resumes 4 s after the last touch or after a part is opened
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
  // phones: a vertical swipe on the body scrolls the page; a sideways drag still turns the body
  useEffect(() => {
    const el = (ctl.current as unknown as { domElement?: HTMLElement } | null)?.domElement;
    if (!el || !matchMedia('(pointer: coarse)').matches) return;
    const set = () => (el.style.touchAction = 'pan-y');
    set();
    const t = window.setTimeout(set, 500); // OrbitControls sets 'none' when it connects
    return () => window.clearTimeout(t);
  }, []);
  return <OrbitControls ref={ctl} target={(cam ?? viewFor(focus)).target} makeDefault enablePan={false} minDistance={0.4} maxDistance={6} enableDamping dampingFactor={0.08} minPolarAngle={0.5} maxPolarAngle={2.4} />;
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
  paused = false,
  view = 'body',
  cam = null,
}: {
  tint: Record<SystemId, Status>;
  focus: SystemId | null;
  values: Record<SystemId, { name: string; line: string }>;
  onPick: (s: SystemId) => void;
  storm?: boolean;
  /** hidden behind the suit turntable: stop rendering until shown again */
  paused?: boolean;
  view?: BodyView;
  /** camera framing for the chosen system view (bodyViews.ts); null = the default for the focus */
  cam?: View | null;
}) {
  const v0 = cam ?? viewFor(focus);
  const theme = usePageTheme();
  const light = theme === 'light';
  // the suit model downloads only once someone asks for it
  const [suitWanted, setSuitWanted] = useState(view === 'suit');
  useEffect(() => void (view === 'suit' && setSuitWanted(true)), [view]);
  return (
    <Canvas frameloop={paused ? 'never' : 'always'} dpr={[1, 1.5]} camera={{ position: v0.pos, fov: 34, near: 0.01, far: 50 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      {/* the body sits on the page itself: same background colour, no panel */}
      <hemisphereLight args={['#f4efe6', light ? '#8d93a8' : '#1a1f3a', light ? 0.6 : 0.45]} />
      <directionalLight position={[-2, 4, 3]} intensity={light ? 1.7 : 2.4} color="#fff3e2" />
      <directionalLight position={[2.5, 2, -3]} intensity={light ? 1.1 : 1.6} color="#ffffff" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[-2.5, 3.5, 3]} rotation={[-0.7, -0.5, 0]} scale={[6, 4, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.8} position={[3, 1, 2.5]} rotation={[0, 0.9, 0]} scale={[3, 5, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.6} position={[0, 2, -4]} rotation={[0, Math.PI, 0]} scale={[6, 3, 1]} color="#f2f2f2" />
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
      <Rig focus={focus} cam={cam} />
    </Canvas>
  );
}
