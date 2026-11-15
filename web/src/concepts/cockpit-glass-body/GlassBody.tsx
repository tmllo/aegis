// The glass body for e^x, Cockpit Glass direction. Restyled from the shared kit
// (components/body/AegisBody.tsx): geometry is read from the GLB, never mutated as a scene.
// Anatomy: BodyParts3D 4.0 (c) Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MetricKey, Region, Status } from '../../data/types';
import { bodyMap, type Box, type NodeName, type Vec3 } from './model';

const MODEL_URL = `${import.meta.env.BASE_URL}models/aegis-body.glb`;

/* ------------------------------------------------------------- home view */

export const FOV = 28;
const BODY_H = bodyMap.model.height_m;
/** The body fills this share of the stage height in the home view. */
const BODY_FILL = 0.74;
export const HOME_DIST = BODY_H / BODY_FILL / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
/** Looked-at height: a little under the body centre so the feet clear the rotate controls. */
export const HOME_TARGET: Vec3 = [0, BODY_H * 0.47, 0];

/** A camera equal to the rig's home pose, for parking readouts on the ring outside the canvas. */
export function homeCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 50);
  cam.position.set(HOME_TARGET[0], HOME_TARGET[1], HOME_DIST);
  cam.lookAt(...HOME_TARGET);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/* -------------------------------------------------------------- materials */

export interface BodyColors {
  neutral: string;
  skin: string;
  ghost: string;
  focus: string;
  status: Record<Status, string>;
}

const VERT = /* glsl */ `
  attribute float aPart;
  uniform float uInflate;
  varying vec3 vN; varying vec3 vV; varying float vPart;
  void main() {
    vec4 w = modelMatrix * vec4(position + normalize(normal) * uInflate, 1.0);
    vN = mat3(modelMatrix) * normal;
    vV = cameraPosition - w.xyz;
    vPart = aPart;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// Lit solid: the organ keeps its own shading (dark at grazing angles, a thin bright edge) and
// carries status by tint. Output is capped below white so the form never burns out.
// aPart: 0 = not part of this region (dropped), 1 = part, 2 = focus part of the selected metric.
const SOLID_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uFocusColor;
  uniform float uGain, uAlpha, uSolid, uFocusOn;
  varying vec3 vN; varying vec3 vV; varying float vPart;
  void main() {
    if (vPart < 0.5) discard;
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, 2.0);
    float edge = pow(1.0 - ndv, 4.0);
    float focus = step(1.5, vPart) * uFocusOn;
    float solid = mix(1.0, focus, uFocusOn);
    vec3 base = mix(uColor, uFocusColor, focus);
    vec3 lit = base * (0.16 + 0.5 * ndv * ndv) * uGain + mix(base, vec3(1.0), 0.35) * edge * 0.55;
    lit = min(lit, vec3(0.62));
    vec3 ghost = base * (0.1 + 0.7 * rim);
    float a = mix(0.03 + 0.32 * rim, uSolid, solid) * uAlpha;
    gl_FragColor = vec4(mix(ghost, lit, solid), a);
    #include <colorspace_fragment>
  }`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uBase, uRim, uPower, uAlpha;
  varying vec3 vN; varying vec3 vV; varying float vPart;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
    gl_FragColor = vec4(uColor, (uBase + uRim * f) * uAlpha);
    #include <colorspace_fragment>
  }`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uGain, uFalloff;
  varying vec3 vN; varying vec3 vV; varying float vPart;
  void main() {
    if (vPart < 0.5) discard;
    float g = pow(abs(dot(normalize(vN), normalize(vV))), uFalloff);
    gl_FragColor = vec4(uColor * g * uGain, 1.0);
    #include <colorspace_fragment>
  }`;

/** Additive blending that never raises the canvas alpha: the canvas sits over a CSS glow. */
const ADDITIVE = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const solidMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uFocusColor: { value: new THREE.Color() },
      uGain: { value: 1 },
      uAlpha: { value: 1 },
      uSolid: { value: 1 },
      uFocusOn: { value: 0 },
      uInflate: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: SOLID_FRAG,
    transparent: true,
  });

const shellMaterial = (additive: boolean, base: number, rim: number, power: number) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uBase: { value: base },
      uRim: { value: rim },
      uPower: { value: power },
      uAlpha: { value: 1 },
      uInflate: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    ...(additive ? ADDITIVE : {}),
  });

const haloMaterial = (inflate: number, falloff: number) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uGain: { value: 0 },
      uFalloff: { value: falloff },
      uInflate: { value: inflate },
    },
    vertexShader: VERT,
    fragmentShader: HALO_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    ...ADDITIVE,
  });

/* ------------------------------------------------------------------ nodes */

const SOLID_NODES: { name: NodeName; solid: number; inflate: number; order: number }[] = [
  { name: 'brain', solid: 1, inflate: 0.012, order: 0 },
  { name: 'heart', solid: 1, inflate: 0.012, order: 0 },
  { name: 'blood', solid: 1, inflate: 0.006, order: 0 },
  { name: 'bones_loadbearing', solid: 0.9, inflate: 0.01, order: 0 },
  { name: 'muscle_antigravity', solid: 0.34, inflate: 0.008, order: 2 },
];
const regionOf = (n: NodeName): Region => bodyMap.model.nodes[n].contract_region;

/** Parts a node shows by default: the union of body-map parts over the metrics that name it. */
function defaultParts(node: NodeName): 'all' | Set<string> {
  const out = new Set<string>();
  let listed = false;
  for (const m of Object.values(bodyMap.metrics)) {
    const p = m.parts[node];
    if (!p) continue;
    if (p === 'all') return 'all';
    listed = true;
    p.forEach((n) => out.add(n));
  }
  return listed ? out : 'all';
}

/** Writes the aPart vertex attribute from the triangle ranges in body-map structure_index. */
function writeParts(geo: THREE.BufferGeometry, node: NodeName, focus: string[] | undefined): boolean {
  const count = geo.getAttribute('position').count;
  const parts = defaultParts(node);
  const arr = new Float32Array(count).fill(parts === 'all' ? 1 : 0);
  const index = geo.getIndex();
  const focusSet = new Set(focus ?? []);
  let any = false;
  if (index && (parts !== 'all' || focusSet.size)) {
    for (const s of bodyMap.structure_index[node]) {
      if (!s.t) continue;
      const isFocus = focusSet.has(s.n);
      const isPart = parts === 'all' || parts.has(s.n);
      if (!isFocus && !isPart) continue;
      if (isFocus) any = true;
      const v = isFocus ? 2 : 1;
      const end = (s.t[0] + s.t[1]) * 3;
      for (let i = s.t[0] * 3; i < end; i++) arr[index.getX(i)] = v;
    }
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(arr, 1));
  return any;
}

function findMesh(obj: THREE.Object3D | undefined): THREE.Mesh | null {
  const found: THREE.Mesh[] = [];
  obj?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
  });
  return found[0] ?? null;
}

/* ------------------------------------------------------------------ frame */

/** Screen-space output written every frame, read by the SVG overlay through refs. */
export interface FrameData {
  /** x, y in stage pixels per anchor, in the order of the anchors prop. */
  anchors: Float32Array;
  /** Selected box on screen: x0, y0, x1, y1. */
  rect: Float32Array;
}

export interface GlassBodyProps {
  nodeStatus: Record<NodeName, Status | null>;
  /** 0..1 share of the career limit already taken: drives the strength of the whole-body aura. */
  auraLevel: number;
  selected: Region | null;
  focusMetric: MetricKey | null;
  /** Status of the selected metric: its focus parts take this colour, green included. */
  focusStatus: Status | null;
  focus: Box | null;
  yawDeg: number;
  anchors: Vec3[];
  colors: BodyColors;
  reduced: boolean;
  frame: MutableRefObject<FrameData>;
  onFrame: (dt: number) => void;
  onSelect: (r: Region) => void;
  /** Pixels dragged horizontally since the last yaw step; cleared by the parent on a step. */
  drag: MutableRefObject<number>;
}

const PICK_ORDER: Region[] = ['heart', 'brain', 'blood', 'bones', 'whole_body'];
/** About 72 px in the home view, in metres. */
const MIN_PROXY = 0.2;

export function GlassBody(props: GlassBodyProps) {
  const { nodeStatus, auraLevel, selected, focusMetric, focusStatus, focus, yawDeg, anchors, colors, reduced, frame, onFrame, onSelect, drag } = props;
  const { scene } = useGLTF(MODEL_URL);
  const camera = useThree((s) => s.camera);

  const geo = useMemo(() => {
    scene.updateMatrixWorld(true);
    const out = {} as Record<NodeName, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>;
    for (const name of Object.keys(bodyMap.model.nodes) as NodeName[]) {
      const m = findMesh(scene.getObjectByName(name));
      if (m) {
        writeParts(m.geometry, name, undefined);
        out[name] = { geometry: m.geometry, matrix: m.matrixWorld.clone() };
      }
    }
    return out;
  }, [scene]);

  const mats = useMemo(() => {
    const solid = {} as Record<NodeName, THREE.ShaderMaterial>;
    const halo = {} as Record<NodeName, THREE.ShaderMaterial>;
    for (const n of SOLID_NODES) {
      solid[n.name] = solidMaterial();
      solid[n.name].uniforms.uSolid.value = n.solid;
      halo[n.name] = haloMaterial(n.inflate, 2.2);
    }
    const ghost = shellMaterial(false, 0.03, 0.5, 1.6);
    ghost.depthFunc = THREE.EqualDepth;
    // Depth prepass with the same vertex shader, so EqualDepth matches bit for bit.
    // Kept in the transparent queue so it sorts after the organs it must not hide.
    const pre = shellMaterial(false, 0, 0, 1);
    pre.colorWrite = false;
    pre.depthWrite = true;
    for (const n of SOLID_NODES) halo[n.name].depthTest = false;
    const aura = haloMaterial(0.03, 1.4);
    aura.depthTest = false;
    return {
      solid,
      halo,
      ghost,
      pre,
      skin: shellMaterial(true, 0.015, 0.62, 2.3),
      aura,
    };
  }, []);

  useEffect(
    () => () => {
      [...Object.values(mats.solid), ...Object.values(mats.halo), mats.ghost, mats.pre, mats.skin, mats.aura].forEach((m) => m.dispose());
    },
    [mats],
  );

  // Colours change on status change only; the frame loop damps scalars.
  useEffect(() => {
    mats.skin.uniforms.uColor.value.set(colors.skin);
    mats.ghost.uniforms.uColor.value.set(colors.ghost);
    mats.aura.uniforms.uColor.value.set(nodeStatus.whole_body ? colors.status[nodeStatus.whole_body] : colors.neutral);
    const map = focusMetric ? bodyMap.metrics[focusMetric] : null;
    for (const n of SOLID_NODES) {
      const s = nodeStatus[n.name];
      const u = mats.solid[n.name].uniforms;
      u.uColor.value.set(s ? colors.status[s] : colors.neutral);
      mats.halo[n.name].uniforms.uColor.value.set(s ? colors.status[s] : colors.neutral);
      const g = geo[n.name];
      if (!g) continue;
      // Focus parts take the metric's status colour; context parts sit in another region, so they stay neutral.
      // When the target organ is not in the model (glucose: no pancreas) nothing is singled out as
      // solid: the node stays one quiet tint and the brackets alone mark the measurement site.
      const absent = (map?.missing?.length ?? 0) > 0;
      const own = absent ? undefined : map?.focus?.[n.name];
      const ctx = map?.context?.[n.name];
      const on = writeParts(g.geometry, n.name, own ?? ctx);
      u.uFocusColor.value.set(own ? colors.status[focusStatus ?? s ?? 'green'] : colors.ghost);
      u.uFocusOn.value = on ? 1 : 0;
      mats.solid[n.name].depthWrite = !on;
    }
  }, [mats, geo, nodeStatus, focusMetric, focusStatus, colors]);

  /* camera rig: eased, interruptible, no controls library */
  const rig = useRef({
    from: { t: new THREE.Vector3(...HOME_TARGET), d: HOME_DIST, yaw: 0 },
    to: { t: new THREE.Vector3(...HOME_TARGET), d: HOME_DIST, yaw: 0 },
    cur: { t: new THREE.Vector3(...HOME_TARGET), d: HOME_DIST, yaw: 0 },
    start: -1,
    first: true,
  });
  const box3 = useMemo(() => new THREE.Box3(), []);
  useEffect(() => {
    const r = rig.current;
    r.from.t.copy(r.cur.t);
    r.from.d = r.cur.d;
    r.from.yaw = r.cur.yaw;
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    r.to.yaw = yaw;
    const tall = focus ? focus.max[1] - focus.min[1] : BODY_H;
    if (!focus || tall > BODY_H * 0.8) {
      r.to.t.set(...HOME_TARGET);
      r.to.d = HOME_DIST;
    } else {
      const wide = Math.hypot(focus.max[0] - focus.min[0], focus.max[2] - focus.min[2]);
      const size = Math.max(tall, wide * 0.8, 0.4);
      r.to.t.set((focus.min[0] + focus.max[0]) / 2, (focus.min[1] + focus.max[1]) / 2, (focus.min[2] + focus.max[2]) / 2);
      r.to.d = Math.min(HOME_DIST, (size * 1.9) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))));
    }
    r.start = -1;
    drag.current = 0;
  }, [focus, yawDeg, drag]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const corners = useMemo(() => Array.from({ length: 8 }, () => new THREE.Vector3()), []);

  useFrame((state, dt) => {
    const r = rig.current;
    const now = state.clock.elapsedTime;
    if (r.start < 0) r.start = now;
    const dur = reduced || r.first ? 0 : 0.7;
    const p = dur === 0 ? 1 : Math.min(1, (now - r.start) / dur);
    const k = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    if (p >= 1) r.first = false;
    r.cur.t.lerpVectors(r.from.t, r.to.t, k);
    r.cur.d = THREE.MathUtils.lerp(r.from.d, r.to.d, k);
    r.cur.yaw = THREE.MathUtils.lerp(r.from.yaw, r.to.yaw, k);
    const yaw = r.cur.yaw - drag.current * 0.008;
    camera.position.set(r.cur.t.x + Math.sin(yaw) * r.cur.d, r.cur.t.y, r.cur.t.z + Math.cos(yaw) * r.cur.d);
    camera.lookAt(r.cur.t);
    camera.updateMatrixWorld();

    // Glow: amber breathes on 2 s, red on 1 s, green never moves.
    const breathe = (s: Status | null) => {
      if (!s || s === 'green' || reduced) return 1;
      const period = s === 'red' ? 1 : 2;
      return 0.775 + 0.225 * Math.sin((now / period) * Math.PI * 2);
    };
    const damp = (x: number, y: number) => THREE.MathUtils.damp(x, y, 14, dt);
    const zoom = THREE.MathUtils.lerp(0.7, 1, THREE.MathUtils.clamp(r.cur.d / HOME_DIST, 0, 1));
    for (const n of SOLID_NODES) {
      const s = nodeStatus[n.name];
      const mine = !selected || regionOf(n.name) === selected;
      const lit = s && s !== 'green';
      const u = mats.solid[n.name].uniforms;
      u.uAlpha.value = damp(u.uAlpha.value, mine ? 1 : lit ? 0.6 : 0.25);
      // Closer camera, lower gain: a close-up must show the organ's form, not a light source.
      u.uGain.value = damp(u.uGain.value, (lit ? 1 : 0.85) * zoom * breathe(s));
      const h = mats.halo[n.name].uniforms;
      // Nested parts stack additively, so the halo stays a faint breath in the home view only.
      h.uGain.value = damp(h.uGain.value, lit && !selected ? 0.008 * breathe(s) : 0);
    }
    const dimOthers = selected && selected !== 'whole_body';
    mats.ghost.uniforms.uAlpha.value = damp(mats.ghost.uniforms.uAlpha.value, !selected || selected === 'bones' ? 1 : 0.3);
    mats.skin.uniforms.uAlpha.value = damp(mats.skin.uniforms.uAlpha.value, dimOthers ? 0.45 : 1);
    const ws = nodeStatus.whole_body;
    const auraBase = 0.03 + 0.2 * auraLevel + (ws && ws !== 'green' ? 0.25 : 0) + (selected === 'whole_body' ? 0.12 : 0);
    mats.aura.uniforms.uGain.value = damp(mats.aura.uniforms.uGain.value, (dimOthers ? 0.35 : 1) * auraBase * breathe(ws));

    // Project anchors and the selected box for the overlay.
    const { width, height } = state.size;
    const out = frame.current;
    anchors.forEach((a, i) => {
      v.set(a[0], a[1], a[2]).project(camera);
      out.anchors[i * 2] = (v.x * 0.5 + 0.5) * width;
      out.anchors[i * 2 + 1] = (-v.y * 0.5 + 0.5) * height;
    });
    if (focus) {
      box3.min.set(...focus.min);
      box3.max.set(...focus.max);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      corners.forEach((c, i) => {
        c.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z).project(camera);
        const x = (c.x * 0.5 + 0.5) * width;
        const y = (-c.y * 0.5 + 0.5) * height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      });
      out.rect.set([x0, y0, x1, y1]);
    }
    onFrame(dt);
  });

  /* padded, invisible hit proxies: nobody has to aim at a vessel with a glove */
  const proxies = useMemo(() => {
    const make = (region: Region, min: Vec3, max: Vec3) => {
      const size = max.map((m, k) => Math.max(m - min[k], MIN_PROXY)) as Vec3;
      const center = max.map((m, k) => (m + min[k]) / 2) as Vec3;
      return { region, size, center };
    };
    const n = bodyMap.model.nodes;
    const g = bodyMap.metrics.glucose.anchor;
    const half = MIN_PROXY * 0.6;
    return [
      make('heart', n.heart.bbox[0], n.heart.bbox[1]),
      make('brain', n.brain.bbox[0], n.brain.bbox[1]),
      make('blood', [g[0] - half, g[1] - half, g[2] - half], [g[0] + half, g[1] + half, g[2] + half]),
      make('bones', n.bones_loadbearing.bbox[0], n.bones_loadbearing.bbox[1]),
      make('whole_body', n.whole_body.bbox[0], n.whole_body.bbox[1]),
    ];
  }, []);

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return; // that was a drag, not a tap
    const hit = new Set(e.intersections.map((i) => i.object.userData.region as Region | undefined));
    const region = PICK_ORDER.find((r) => hit.has(r));
    if (region) onSelect(region);
  };

  const noRay = () => null;
  return (
    <group>
      {SOLID_NODES.map((n) =>
        geo[n.name] ? (
          <group key={n.name} matrix={geo[n.name].matrix} matrixAutoUpdate={false}>
            <mesh geometry={geo[n.name].geometry} material={mats.solid[n.name]} renderOrder={n.order} raycast={noRay} />
            <mesh geometry={geo[n.name].geometry} material={mats.halo[n.name]} renderOrder={4} raycast={noRay} />
          </group>
        ) : null,
      )}
      {geo.bones && (
        <group matrix={geo.bones.matrix} matrixAutoUpdate={false}>
          <mesh geometry={geo.bones.geometry} material={mats.pre} renderOrder={1} raycast={noRay} />
          <mesh geometry={geo.bones.geometry} material={mats.ghost} renderOrder={3} raycast={noRay} />
        </group>
      )}
      {geo.whole_body && (
        <group matrix={geo.whole_body.matrix} matrixAutoUpdate={false}>
          <mesh geometry={geo.whole_body.geometry} material={mats.aura} renderOrder={5} raycast={noRay} />
          <mesh geometry={geo.whole_body.geometry} material={mats.skin} renderOrder={6} raycast={noRay} />
        </group>
      )}

      {/* floor ring under the feet */}
      <group rotation-x={-Math.PI / 2} position-y={0.002}>
        <mesh raycast={noRay}>
          <ringGeometry args={[0.43, 0.434, 128]} />
          <meshBasicMaterial color={colors.neutral} transparent opacity={0.9} depthWrite={false} />
        </mesh>
        <mesh raycast={noRay}>
          <ringGeometry args={[0.62, 0.623, 128]} />
          <meshBasicMaterial color={colors.neutral} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      </group>

      <group onClick={pick}>
        {proxies.map((p) => (
          <mesh key={p.region} position={p.center} scale={p.size} userData={{ region: p.region }}>
            <boxGeometry />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
