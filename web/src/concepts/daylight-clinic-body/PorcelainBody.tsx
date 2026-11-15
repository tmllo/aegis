// Frosted porcelain body for the Daylight Clinic direction.
// Anatomy: BodyParts3D 4.0 (c) The Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
// Layers: organs (opaque) -> skeleton depth prepass -> ghost skeleton -> muscle -> skin veil
// -> status pass. Flagged or selected structures (triangle ranges from body-map.json) are
// drawn again above every veil in the status colour, so the state reads from across a room.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { Region, Status } from '../../data/types';
import { BODY_H, FOV, HOME_TY, HOME_VISIBLE, NODE_NAMES, type Box, type Vec3 } from './model';

const URL = '/models/aegis-body.glb';
const HOTS = 4;

export const PALETTE = {
  porcelain: '#F6F2EA',
  edge: '#4A443A',
  shadow: '#CFC6B8',
  deep: '#7F786C',
  accent: '#2B3FBF',
  bone3: '#DDD6C8',
  ink: '#1A1D2B',
  amber: '#B86E00',
  red: '#C8322B',
  neutral: '#6B655B',
};
const STATUS_HEX: Record<Status, string> = { green: PALETTE.deep, amber: PALETTE.amber, red: PALETTE.red };

const VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
#define HOTS ${HOTS}
uniform vec3 uBase;
uniform vec3 uEdge;
uniform vec3 uPorcelain;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uEdgeAmt;
uniform float uAlphaC;
uniform float uAlphaE;
uniform float uMute;
uniform float uShow;
uniform float uHotGain;
uniform float uHotCut;
uniform float uHoleAmt;
uniform float uSolid;
uniform float uThin;
uniform vec4 uHole;
uniform vec3 uHotPos[HOTS];
uniform vec3 uHotCol[HOTS];
uniform vec2 uHot[HOTS];
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(n, v)), 1.7);
  float lit = dot(n, normalize(vec3(0.35, 0.8, 0.5))) * 0.5 + 0.5;
  vec3 col = uBase * mix(0.8, 1.03, lit);
  float a = mix(uAlphaC * (1.0 - 0.45 * uThin), uAlphaE, f);
  float cut = 0.0;
  col = mix(col, uTint, uTintAmt);
  for (int i = 0; i < HOTS; i++) {
    float d = distance(vW, uHotPos[i]);
    float h = 1.0 - smoothstep(0.0, uHot[i].x, d);
    cut = max(cut, h * uHot[i].y);
    h = h * uHot[i].y * uHotGain;
    col = mix(col, uHotCol[i], h * 0.9);
    a = mix(a, max(a, 0.86), h);
  }
  col = mix(col, uEdge, f * uEdgeAmt);
  // Stepping back means less saturation, never more opacity: the ghost layers stay ghosts.
  col = mix(col, uPorcelain, uMute * 0.3);
  a = max(a, uSolid * 0.92);
  // The ghost skeleton opens around a flagged organ and around the focus, so ribs never band across it.
  float hole = 1.0 - smoothstep(uHole.w * 0.75, uHole.w * 1.35, distance(vW, uHole.xyz));
  a *= 1.0 - 0.92 * max(uHotCut * smoothstep(0.0, 0.45, cut), uHoleAmt * hole);
  a *= uShow;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// Status pass: flat status colour with a darker rim, so the structure keeps an outline.
const TOP_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec3 uRim;
uniform float uA;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float f = 1.0 - abs(dot(n, v));
  float lit = dot(n, normalize(vec3(0.35, 0.8, 0.5))) * 0.5 + 0.5;
  vec3 col = uCol * mix(0.86, 1.1, lit);
  col = mix(col, uRim, smoothstep(0.45, 0.92, f));
  gl_FragColor = vec4(col, uA);
  #include <colorspace_fragment>
}`;

const PRE_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

interface LayerCfg {
  base: string;
  edgeAmt: number;
  alphaC: number;
  alphaE: number;
  hotGain: number;
  /** 1 = this layer fades out around hotspots instead of taking their colour. */
  hotCut?: number;
  order: number;
  prepass?: boolean;
  /** Hidden unless flagged or selected. */
  onDemand?: boolean;
}

const LAYERS: Record<string, LayerCfg> = {
  brain: { base: '#D3C9BC', edgeAmt: 0.35, alphaC: 1, alphaE: 1, hotGain: 0.5, order: 0 },
  heart: { base: '#CDBEB3', edgeAmt: 0.35, alphaC: 1, alphaE: 1, hotGain: 0.5, order: 0 },
  blood: { base: '#D6CCC0', edgeAmt: 0.3, alphaC: 1, alphaE: 1, hotGain: 0.7, order: 0 },
  bones: { base: '#CFC6B8', edgeAmt: 0.45, alphaC: 0.42, alphaE: 0.78, hotGain: 0, hotCut: 1, order: 2, prepass: true },
  bones_loadbearing: { base: '#CFC6B8', edgeAmt: 0.45, alphaC: 0.42, alphaE: 0.78, hotGain: 0.9, order: 2, prepass: true },
  muscle_antigravity: { base: '#DBCBC2', edgeAmt: 0.4, alphaC: 0.34, alphaE: 0.7, hotGain: 0.6, order: 3, onDemand: true },
  whole_body: { base: PALETTE.porcelain, edgeAmt: 0.85, alphaC: 0.46, alphaE: 0.97, hotGain: 1, order: 4 },
};

export interface Hot {
  pos: Vec3;
  radius: number;
  status: Status;
  /** false when another region is selected: the tint steps back. */
  lit: boolean;
}

export interface BodyState {
  /** Status per GLB node, from the metrics that name the node. */
  nodeStatus: Record<string, Status>;
  /** Exact structures to draw solid, per node: triangle ranges and the colour status. */
  focus: Record<string, { ranges: [number, number][]; status: Status }>;
  /** Nodes of the selected metric; null when nothing is selected. */
  selectedNodes: string[] | null;
  skinStatus: Status;
  hots: Hot[];
  /** Where the ghost skeleton opens for the selected structures; null when none. */
  hole: { pos: Vec3; radius: number } | null;
}

export interface Pose {
  box: Box | null;
  azimuth: number;
  /** Fraction of the canvas height hidden by the bottom sheet. */
  occlude: number;
}

interface Props {
  state: BodyState;
  pose: Pose;
  regionBoxes: Record<Region, Box>;
  reduced: boolean;
  onPick: (r: Region) => void;
  onFrame: (camera: THREE.Camera, w: number, h: number) => void;
  onReady: () => void;
}

const PICK_ORDER: Region[] = ['heart', 'brain', 'blood', 'bones', 'whole_body'];
const noRaycast = () => null;
const breath = (s: Status, t: number): number =>
  s === 'red' ? 0.8 + 0.2 * Math.sin(t * Math.PI * 2) : s === 'amber' ? 0.84 + 0.16 * Math.sin(t * Math.PI) : 1;

function makeShared() {
  return {
    uPorcelain: { value: new THREE.Color(PALETTE.porcelain) },
    uEdge: { value: new THREE.Color(PALETTE.edge) },
    uHotPos: { value: Array.from({ length: HOTS }, () => new THREE.Vector3()) },
    uHotCol: { value: Array.from({ length: HOTS }, () => new THREE.Color()) },
    uHot: { value: Array.from({ length: HOTS }, () => new THREE.Vector2(0.1, 0)) },
    uHole: { value: new THREE.Vector4(0, 0, 0, 0.1) },
  };
}

function makeMaterial(cfg: LayerCfg, shared: ReturnType<typeof makeShared>) {
  const veil = cfg.alphaC < 1;
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...shared,
      uBase: { value: new THREE.Color(cfg.base) },
      uTint: { value: new THREE.Color(PALETTE.deep) },
      uTintAmt: { value: 0 },
      uEdgeAmt: { value: cfg.edgeAmt },
      uAlphaC: { value: cfg.alphaC },
      uAlphaE: { value: cfg.alphaE },
      uMute: { value: 0 },
      uShow: { value: cfg.onDemand ? 0 : 1 },
      uHotGain: { value: cfg.hotGain },
      uHotCut: { value: cfg.hotCut ?? 0 },
      uHoleAmt: { value: 0 },
      uSolid: { value: 0 },
      uThin: { value: 0 },
    },
    transparent: veil,
    depthWrite: !veil,
    side: THREE.FrontSide,
  });
}

function makeTop() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: TOP_FRAG,
    uniforms: {
      uCol: { value: new THREE.Color(PALETTE.neutral) },
      uRim: { value: new THREE.Color(PALETTE.ink) },
      uA: { value: 0 },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const clearDepth = (renderer: THREE.WebGLRenderer) => renderer.clearDepth();

/** Clears depth between passes so the status pass draws above the veils with its own occlusion. */
function DepthClear({ order }: { order: number }) {
  return (
    <mesh renderOrder={order} frustumCulled={false} raycast={noRaycast} onBeforeRender={clearDepth}>
      <planeGeometry args={[0.001, 0.001]} />
      <meshBasicMaterial transparent colorWrite={false} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function Body({ state, reduced, onReady }: Pick<Props, 'state' | 'reduced' | 'onReady'>) {
  const { scene } = useGLTF(URL);
  const live = useRef(state);
  live.current = state;
  const rim = useMemo(() => new THREE.Color(), []);
  const clock = useRef(0);
  const hotAmt = useRef(new Float32Array(HOTS));

  const shared = useMemo(makeShared, []);

  // Own geometries (sharing the loaded buffers) so the cached glTF scene is never mutated.
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const known = new Set(NODE_NAMES);
    const out: {
      node: string;
      cfg: LayerCfg;
      geo: THREE.BufferGeometry;
      src: THREE.BufferGeometry;
      p: THREE.Vector3;
      q: THREE.Quaternion;
      s: THREE.Vector3;
      mats: [THREE.ShaderMaterial, THREE.ShaderMaterial];
      pre: THREE.ShaderMaterial | null;
      /** Status pass: the rest of the node, then its focus structures. */
      top: { rest: THREE.ShaderMaterial; focus: THREE.ShaderMaterial; restMesh: THREE.Mesh | null; focusMesh: THREE.Mesh | null } | null;
    }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const node = known.has(m.name) ? m.name : m.parent?.name ?? '';
      const cfg = LAYERS[node];
      if (!cfg) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', m.geometry.attributes.position);
      geo.setAttribute('normal', m.geometry.attributes.normal);
      geo.setIndex(m.geometry.index);
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      m.matrixWorld.decompose(p, q, s);
      const pre = cfg.prepass
        ? new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: PRE_FRAG, colorWrite: false })
        : null;
      const top = node === 'whole_body' ? null : { rest: makeTop(), focus: makeTop(), restMesh: null, focusMesh: null };
      out.push({ node, cfg, geo, src: m.geometry, p, q, s, mats: [makeMaterial(cfg, shared), makeMaterial(cfg, shared)], pre, top });
    });
    return out;
  }, [scene, shared]);

  useEffect(
    () => () => {
      for (const p of parts) {
        p.geo.dispose();
        p.mats.forEach((m) => m.dispose());
        p.pre?.dispose();
        p.top?.rest.dispose();
        p.top?.focus.dispose();
      }
    },
    [parts],
  );

  useEffect(() => {
    onReady();
  }, [onReady]);

  // Focus structures become their own draw group (material slot 1) on the node mesh.
  const focusKey = JSON.stringify(state.focus);
  useEffect(() => {
    for (const p of parts) {
      const total = p.geo.index?.count ?? 0;
      const ranges = (state.focus[p.node]?.ranges ?? [])
        .map(([first, count]) => [first * 3, count * 3] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      p.geo.clearGroups();
      let at = 0;
      for (const [start, count] of ranges) {
        if (start < at) continue;
        if (start > at) p.geo.addGroup(at, start - at, 0);
        p.geo.addGroup(start, count, 1);
        at = start + count;
      }
      if (at < total) p.geo.addGroup(at, total - at, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, focusKey]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    clock.current += d;
    const t = clock.current;
    const st = live.current;
    const anySel = st.selectedNodes !== null;

    for (let i = 0; i < HOTS; i++) {
      const h = st.hots[i];
      const target = h ? (h.lit ? 1 : 0.18) * (reduced ? 1 : breath(h.status, t)) : 0;
      hotAmt.current[i] = THREE.MathUtils.damp(hotAmt.current[i], target, 12, d);
      if (h) {
        shared.uHotPos.value[i].set(h.pos[0], h.pos[1], h.pos[2]);
        shared.uHotCol.value[i].set(STATUS_HEX[h.status]);
      }
      shared.uHot.value[i].set(h ? h.radius : 0.1, hotAmt.current[i]);
    }

    if (st.hole) shared.uHole.value.set(st.hole.pos[0], st.hole.pos[1], st.hole.pos[2], st.hole.radius);

    for (const p of parts) {
      const skin = p.node === 'whole_body';
      const status = skin ? st.skinStatus : st.nodeStatus[p.node] ?? 'green';
      const isSel = anySel && st.selectedNodes!.includes(p.node);
      const flagged = status !== 'green';
      const back = anySel && !isSel ? 0.3 : 1;
      const b = reduced ? 1 : breath(status, t);
      const fo = st.focus[p.node];
      const [base, focus] = p.mats;

      base.uniforms.uTint.value.set(STATUS_HEX[status]);
      // With exact focus structures the rest of the node only hints at the colour.
      const baseTarget = (flagged ? (skin ? 0.3 : fo ? 0.2 : isSel ? 0.9 : 0.82) : isSel && !skin ? 0.22 : 0) * back * b;
      base.uniforms.uTintAmt.value = THREE.MathUtils.damp(base.uniforms.uTintAmt.value, baseTarget, 12, d);

      const foStatus = fo?.status ?? status;
      focus.uniforms.uTint.value.set(fo && foStatus === 'green' ? PALETTE.ink : STATUS_HEX[foStatus]);
      const focusTarget = fo ? (fo.status !== 'green' ? 0.96 * b : 0.58) * back : baseTarget;
      focus.uniforms.uTintAmt.value = THREE.MathUtils.damp(focus.uniforms.uTintAmt.value, focusTarget, 12, d);

      const mute = !skin && anySel && !isSel ? 1 : 0;
      const show = p.cfg.onDemand ? (flagged || isSel ? 1 : 0) : 1;
      const holeAmt = st.hole && p.cfg.prepass && !isSel ? 1 : 0;
      const gain = p.cfg.hotGain * (skin && anySel ? 0.4 : 1) * (!skin && fo ? 0.4 : 1);
      focus.uniforms.uSolid.value = THREE.MathUtils.damp(focus.uniforms.uSolid.value, fo && (isSel || fo.status !== 'green') ? 1 : 0, 12, d);
      for (const m of p.mats) {
        m.uniforms.uHoleAmt.value = THREE.MathUtils.damp(m.uniforms.uHoleAmt.value, holeAmt, 12, d);
        m.uniforms.uHotGain.value = THREE.MathUtils.damp(m.uniforms.uHotGain.value, gain, 12, d);
        m.uniforms.uThin.value = THREE.MathUtils.damp(m.uniforms.uThin.value, skin && anySel ? 1 : 0, 12, d);
        m.uniforms.uMute.value = THREE.MathUtils.damp(m.uniforms.uMute.value, mute, 12, d);
        m.uniforms.uShow.value = THREE.MathUtils.damp(m.uniforms.uShow.value, show, 12, d);
      }

      if (p.top) {
        const { rest, focus: fm, restMesh, focusMesh } = p.top;
        const restTarget = (flagged ? (fo ? 0.5 : 0.94) : isSel ? (fo ? 0.16 : 0.6) : 0) * back * b;
        const focusTarget = fo ? 0.97 * back * (fo.status === 'green' ? 1 : b) : 0;
        rest.uniforms.uA.value = THREE.MathUtils.damp(rest.uniforms.uA.value, restTarget, 12, d);
        fm.uniforms.uA.value = THREE.MathUtils.damp(fm.uniforms.uA.value, focusTarget, 12, d);
        if (flagged || restTarget > 0) {
          rest.uniforms.uCol.value.set(flagged ? STATUS_HEX[status] : PALETTE.neutral);
          rest.uniforms.uRim.value.copy(rim.copy(rest.uniforms.uCol.value).multiplyScalar(0.5));
        }
        if (fo) {
          fm.uniforms.uCol.value.set(fo.status === 'green' ? PALETTE.neutral : STATUS_HEX[fo.status]);
          fm.uniforms.uRim.value.copy(rim.copy(fm.uniforms.uCol.value).multiplyScalar(0.42));
        }
        if (restMesh) restMesh.visible = rest.uniforms.uA.value > 0.01;
        if (focusMesh) focusMesh.visible = fm.uniforms.uA.value > 0.01;
      }
    }
  });

  return (
    <group>
      {parts.map((p) => (
        <group key={p.node} position={p.p} quaternion={p.q} scale={p.s}>
          {p.pre && (
            <mesh geometry={p.src} material={p.pre} renderOrder={1} frustumCulled={false} raycast={noRaycast} />
          )}
          <mesh geometry={p.geo} material={p.mats} renderOrder={p.cfg.order} frustumCulled={false} raycast={noRaycast} />
          {p.top && (
            <>
              <mesh
                ref={(el) => (p.top!.restMesh = el)}
                geometry={p.geo}
                material={[p.top.rest, HIDDEN]}
                renderOrder={10}
                visible={false}
                frustumCulled={false}
                raycast={noRaycast}
              />
              <mesh
                ref={(el) => (p.top!.focusMesh = el)}
                geometry={p.geo}
                material={[HIDDEN, p.top.focus]}
                renderOrder={12}
                visible={false}
                frustumCulled={false}
                raycast={noRaycast}
              />
            </>
          )}
        </group>
      ))}
      <DepthClear order={9} />
      <DepthClear order={11} />
    </group>
  );
}

/** Invisible padded boxes: gloves never have to hit a vessel. Most specific region wins. */
function Proxies({ boxes, onPick }: { boxes: Record<Region, Box>; onPick: (r: Region) => void }) {
  const items = useMemo(
    () =>
      PICK_ORDER.map((region) => {
        const [a, b] = boxes[region];
        const pad = region === 'whole_body' ? 0.02 : 0.05;
        return {
          region,
          position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3,
          scale: [b[0] - a[0] + pad * 2, b[1] - a[1] + pad * 2, b[2] - a[2] + pad * 2] as Vec3,
        };
      }),
    [boxes],
  );
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    let best: Region | null = null;
    for (const hit of e.intersections) {
      const r = hit.object.userData.region as Region | undefined;
      if (r && (best === null || PICK_ORDER.indexOf(r) < PICK_ORDER.indexOf(best))) best = r;
    }
    if (best) onPick(best);
  };
  return (
    <group onPointerDown={down}>
      {items.map((it) => (
        <mesh key={it.region} position={it.position} scale={it.scale} userData={{ region: it.region }}>
          <boxGeometry />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

interface Cam {
  x: number;
  y: number;
  z: number;
  az: number;
  dist: number;
}

function goalFor(pose: Pose): Cam {
  if (!pose.box) return { x: 0, y: BODY_H * HOME_TY, z: 0, az: pose.azimuth, dist: HOME_VISIBLE / (2 * TAN) };
  const [a, b] = pose.box;
  const h = b[1] - a[1];
  const free = 1 - pose.occlude;
  const fill = THREE.MathUtils.lerp(0.5, 0.84, THREE.MathUtils.smoothstep(h, 0.3, 1.2));
  const visible = Math.max(1.1, h / (fill * free));
  return {
    x: (a[0] + b[0]) / 2,
    y: (a[1] + b[1]) / 2 - (pose.occlude / 2) * visible,
    z: (a[2] + b[2]) / 2,
    az: pose.azimuth,
    dist: visible / (2 * TAN),
  };
}

/** Fixed views only (no free orbit): 700 ms eased move between framings. */
function Rig({ pose, reduced, onFrame }: Pick<Props, 'pose' | 'reduced' | 'onFrame'>) {
  const camera = useThree((s) => s.camera);
  const cur = useRef<Cam | null>(null);
  const from = useRef<Cam | null>(null);
  const to = useRef<Cam | null>(null);
  const t0 = useRef(0);
  const goal = useMemo(() => goalFor(pose), [pose]);

  useEffect(() => {
    if (!cur.current) {
      cur.current = { ...goal };
      to.current = { ...goal };
      from.current = { ...goal };
      return;
    }
    from.current = { ...cur.current };
    // Shortest way round for the azimuth.
    const delta = Math.atan2(Math.sin(goal.az - cur.current.az), Math.cos(goal.az - cur.current.az));
    to.current = { ...goal, az: cur.current.az + delta };
    t0.current = performance.now();
  }, [goal]);

  useFrame(({ size }) => {
    const c = cur.current;
    const a = from.current;
    const b = to.current;
    if (!c || !a || !b) return;
    const k = reduced ? 1 : Math.min(1, (performance.now() - t0.current) / 700);
    const e = ease(k);
    c.x = a.x + (b.x - a.x) * e;
    c.y = a.y + (b.y - a.y) * e;
    c.z = a.z + (b.z - a.z) * e;
    c.az = a.az + (b.az - a.az) * e;
    c.dist = a.dist + (b.dist - a.dist) * e;
    camera.position.set(c.x + Math.sin(c.az) * c.dist, c.y, c.z + Math.cos(c.az) * c.dist);
    camera.lookAt(c.x, c.y, c.z);
    camera.updateMatrixWorld();
    onFrame(camera, size.width, size.height);
  }, -1);
  return null;
}

function Floor() {
  return (
    <group rotation-x={-Math.PI / 2} position-y={-0.004}>
      <mesh raycast={noRaycast}>
        <circleGeometry args={[0.34, 72]} />
        <meshBasicMaterial color={PALETTE.bone3} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh raycast={noRaycast}>
        <ringGeometry args={[0.42, 0.423, 96]} />
        <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function PorcelainScene(props: Props) {
  return (
    <>
      <Rig pose={props.pose} reduced={props.reduced} onFrame={props.onFrame} />
      <Floor />
      <Body state={props.state} reduced={props.reduced} onReady={props.onReady} />
      <Proxies boxes={props.regionBoxes} onPick={props.onPick} />
    </>
  );
}

useGLTF.preload(URL);
