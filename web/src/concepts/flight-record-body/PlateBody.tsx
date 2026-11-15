// The anatomical plate: the e^x body model restyled as an engraving.
// A matte paper-white ghost shell, a ghosted skeleton, organs in graded warm
// greys under one side light. Only plates with a status take colour.
// Anatomy: BodyParts3D 4.0 (c) Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MetricKey, Status } from '../../data/types';
import { inkWeights, plateAnchor, reachOf, type NodeName, type Plate, type PlateId } from './plates';

const MODEL_URL = `${import.meta.env.BASE_URL}models/aegis-body.glb`;

export const INK: Record<Status | 'paper', string> = {
  paper: '#F4F1EA',
  green: '#5FCF96',
  amber: '#F0B04A',
  red: '#F0564A',
};

/** Selected-but-nominal structures lift to this mid grey; full-strength ink is kept for amber and red. */
const LIFT = '#827E74';
/** Stand-off of the dose contour from the skin, metres: a readable minimum plus a share that grows with dose. */
export const doseStandoff = (dose: number): number => 0.02 + 0.06 * dose;

const VERT = /* glsl */ `
  attribute float aInk;
  uniform float uInflate;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying float vInk;
  void main() {
    vec3 p = position + normal * uInflate;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    vInk = aInk;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uInk;
  uniform float uInkAmt;
  uniform vec3 uAnchor;
  uniform float uRadius;
  uniform float uAlpha;
  uniform float uFresnel;
  uniform float uPower;
  uniform float uShade;
  uniform float uSolid;
  uniform float uOpaque;
  uniform float uDim;
  uniform float uPulse;
  uniform vec3 uLight;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  varying float vInk;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, normalize(uLight)) * 0.5 + 0.5;
    float fr = pow(1.0 - abs(dot(n, normalize(vV))), uPower);
    vec3 col = uBase * mix(1.0, 0.28 + 0.82 * ndl * ndl, uShade);
    // Ink spreads outward from the anchor vertex.
    float reveal = 1.0 - smoothstep(uRadius - 0.025, uRadius, distance(vP, uAnchor));
    float ink = uInkAmt * vInk * reveal;
    vec3 inked = uInk * (0.5 + 0.55 * ndl) * uPulse;
    col = mix(col, inked, ink);
    col += uInk * fr * 0.45 * ink;
    float a = uAlpha + uFresnel * fr;
    a = mix(a, 1.0, ink * uSolid);
    a += ink * (1.0 - uSolid) * fr * 0.35;
    col *= mix(0.42, 1.0, uDim);
    a = mix(a * mix(0.3, 1.0, uDim), 1.0, uOpaque);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

interface LayerDef {
  node: NodeName;
  plate: PlateId | null;
  base: string;
  opaque: boolean;
  alpha: number;
  fresnel: number;
  power: number;
  shade: number;
  solid: number;
  order: number;
  prepass?: boolean;
  offset?: boolean;
}

const LAYERS: LayerDef[] = [
  { node: 'brain', plate: 'brain', base: '#8E8A7F', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'heart', plate: 'heart', base: '#A6A195', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'blood', plate: 'blood', base: '#6E6B63', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'bones', plate: null, base: '#D8D3C6', opaque: false, alpha: 0.27, fresnel: 0.55, power: 1.6, shade: 0.9, solid: 1, order: 2, prepass: true },
  { node: 'bones_loadbearing', plate: 'bone', base: '#D8D3C6', opaque: false, alpha: 0, fresnel: 0, power: 2, shade: 1, solid: 1, order: 3, offset: true },
  { node: 'muscle_antigravity', plate: 'muscle', base: '#A39A8E', opaque: false, alpha: 0.05, fresnel: 0.2, power: 2, shade: 0.8, solid: 0.92, order: 3 },
  { node: 'whole_body', plate: 'temp', base: INK.paper, opaque: false, alpha: 0.015, fresnel: 0.5, power: 2.4, shade: 0, solid: 0, order: 5 },
];

function makeMaterial(def: LayerDef): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: !def.opaque,
    depthWrite: def.opaque,
    side: def.opaque ? THREE.FrontSide : def.node === 'whole_body' ? THREE.FrontSide : THREE.DoubleSide,
    uniforms: {
      uBase: { value: new THREE.Color(def.base) },
      uInk: { value: new THREE.Color(INK.paper) },
      uInkAmt: { value: 0 },
      uAnchor: { value: new THREE.Vector3() },
      uRadius: { value: 10 },
      uAlpha: { value: def.alpha },
      uFresnel: { value: def.fresnel },
      uPower: { value: def.power },
      uShade: { value: def.shade },
      uSolid: { value: def.solid },
      uOpaque: { value: def.opaque ? 1 : 0 },
      uDim: { value: 1 },
      uPulse: { value: 1 },
      uInflate: { value: 0 },
      // One light, from the upper left of the plate (view space).
      uLight: { value: new THREE.Vector3(-0.75, 0.55, 0.6) },
    },
  });
  if (def.prepass) m.depthFunc = THREE.EqualDepth;
  if (def.offset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  return m;
}

const CONTOUR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = smoothstep(0.5, 0.92, fr) * uStrength;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export interface PlateBodyProps {
  plates: Plate[];
  selected: PlateId | null;
  /** Metric shown for the selected plate (decides which structures take the ink). */
  metric: MetricKey | null;
  /** Mission dose / career limit, 0 to 1: how far the dose contour stands off the skin. */
  dose: number;
  /** Body turn in degrees: 0 front, 90 body-left side. */
  turnDeg: number;
  reducedMotion: boolean;
  /** Chapter 01: status only, so no organ takes colour. */
  neutral: boolean;
  /** How far right of the canvas centre the body should sit, in pixels (read every frame). */
  shiftPx: { current: number };
  /** Called every frame with each plate anchor in canvas pixels. Must not set React state. */
  onProject: (points: Record<PlateId, { x: number; y: number }>, frame: BodyFrame) => void;
}

export interface BodyFrame {
  /** Pixels per metre at the body plane. */
  scale: number;
  /** Canvas x of the body's centre line. */
  cx: number;
}

const CENTER = new THREE.Vector3(0, 0.875, 0);
const WIDE = 3.7;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function PlateBody({ plates, selected, metric, dose, turnDeg, reducedMotion, neutral, shiftPx, onProject }: PlateBodyProps) {
  const { nodes } = useGLTF(MODEL_URL) as unknown as { nodes: Record<string, THREE.Mesh> };
  const group = useRef<THREE.Group>(null);

  // Own geometries that share the cached buffers, so the cached GLB is never mutated.
  const geoms = useMemo(() => {
    const out = {} as Record<NodeName, THREE.BufferGeometry>;
    for (const def of LAYERS) {
      const src = nodes[def.node].geometry;
      const g = new THREE.BufferGeometry();
      g.setIndex(src.index);
      g.setAttribute('position', src.attributes.position);
      g.setAttribute('normal', src.attributes.normal);
      g.setAttribute('aInk', new THREE.BufferAttribute(new Float32Array(src.attributes.position.count).fill(1), 1));
      g.boundingSphere = src.boundingSphere;
      g.boundingBox = src.boundingBox;
      out[def.node] = g;
    }
    return out;
  }, [nodes]);

  const mats = useMemo(() => Object.fromEntries(LAYERS.map((d) => [d.node, makeMaterial(d)])) as Record<NodeName, THREE.ShaderMaterial>, []);
  const prepass = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  const contour = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: CONTOUR_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(INK.paper) },
          uStrength: { value: 0.3 },
          uInflate: { value: 0.01 },
        },
      }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
      Object.values(geoms).forEach((g) => g.dispose());
      prepass.dispose();
      contour.dispose();
    },
    [mats, geoms, prepass, contour],
  );

  const byId = useMemo(() => new Map(plates.map((p) => [p.id, p])), [plates]);

  // Which structures take the ink: the shown metric of each plate (selected metric, else its worst).
  useEffect(() => {
    for (const def of LAYERS) {
      const plate = def.plate ? byId.get(def.plate) : undefined;
      if (!plate) continue;
      const m = plate.id === selected && metric ? metric : plate.primary;
      const g = geoms[def.node];
      const attr = g.getAttribute('aInk') as THREE.BufferAttribute;
      (attr.array as Float32Array).set(inkWeights(def.node, m, g.index!.array, attr.count));
      attr.needsUpdate = true;
      mats[def.node].uniforms.uAnchor.value.fromArray(plateAnchor(plate, m, 0));
      mats[def.node].uniforms.uInk.value.set(plate.status === 'green' || neutral ? LIFT : INK[plate.status]);
    }
  }, [byId, selected, metric, geoms, mats, neutral]);

  // Dose contour colour follows the radiation plate's status.
  useEffect(() => {
    const s = byId.get('dose')?.status ?? 'green';
    contour.uniforms.uColor.value.set(s === 'green' || neutral ? INK.paper : INK[s]);
  }, [byId, contour, neutral]);

  // Start the radial reveal whenever the selection (or its metric) changes.
  const reveal = useRef({ t: 1, reach: 1 });
  useEffect(() => {
    const plate = selected ? byId.get(selected) : undefined;
    if (!plate?.node) return;
    reveal.current = { t: reducedMotion ? 1 : 0, reach: reachOf(plate.node, plateAnchor(plate, metric ?? plate.primary, 0)) };
  }, [selected, metric, byId, reducedMotion]);

  const cam = useRef({ target: CENTER.clone(), dist: WIDE, shift: shiftPx.current });
  const goal = useMemo(() => new THREE.Vector3(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const clock = useRef(0);

  useFrame((state, dt) => {
    clock.current += dt;
    const t = clock.current;
    const sel = selected ? byId.get(selected) : undefined;
    const k = reducedMotion ? 1000 : 6;

    // Ink reveal, 400 ms.
    reveal.current.t = Math.min(1, reveal.current.t + dt / 0.4);
    const radius = easeInOut(reveal.current.t) * reveal.current.reach;

    for (const def of LAYERS) {
      const u = mats[def.node].uniforms;
      const plate = def.plate ? byId.get(def.plate) : undefined;
      const isSel = !!plate && plate.id === selected;
      const status: Status = plate?.status ?? 'green';
      const inkTarget = neutral ? 0 : status !== 'green' ? 1 : isSel ? 0.6 : 0;
      u.uInkAmt.value = THREE.MathUtils.damp(u.uInkAmt.value, inkTarget, k, dt);
      u.uRadius.value = isSel ? radius : 10;
      const dimTarget = !sel || isSel ? 1 : def.node === 'bones' ? 0.55 : def.node === 'whole_body' ? 0.7 : 0.3;
      u.uDim.value = THREE.MathUtils.damp(u.uDim.value, dimTarget, k, dt);
      // Amber breathes over 2 s, red over 1 s, green is still.
      const period = neutral ? 0 : status === 'red' ? 1 : status === 'amber' ? 2 : 0;
      u.uPulse.value = period && !reducedMotion ? 0.86 + 0.14 * Math.sin((t / period) * Math.PI * 2) : 1;
    }

    // Dose contour: stands further off the skin as the mission dose nears the career limit.
    const doseSel = selected === 'dose';
    const standoff = doseStandoff(dose);
    contour.uniforms.uInflate.value = standoff;
    const doseStatus = byId.get('dose')?.status ?? 'green';
    const strength = neutral ? 0.25 : doseSel ? 1 : sel ? 0.15 : doseStatus !== 'green' ? 0.9 : 0.55;
    contour.uniforms.uStrength.value = THREE.MathUtils.damp(contour.uniforms.uStrength.value, strength, k, dt);

    // Body turn and camera: damped, interruptible.
    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, THREE.MathUtils.degToRad(-turnDeg), reducedMotion ? 1000 : 5, dt);
    }
    if (sel?.zoom && group.current) {
      v.fromArray(plateAnchor(sel, metric ?? sel.primary, 0)).applyAxisAngle(THREE.Object3D.DEFAULT_UP, group.current.rotation.y);
      goal.copy(CENTER).lerp(v, 0.8);
      goal.z = 0;
    } else goal.copy(CENTER);
    const c = cam.current;
    const kc = reducedMotion ? 1000 : 4.5;
    c.target.x = THREE.MathUtils.damp(c.target.x, goal.x, kc, dt);
    c.target.y = THREE.MathUtils.damp(c.target.y, goal.y, kc, dt);
    c.dist = THREE.MathUtils.damp(c.dist, sel?.zoom ?? WIDE, kc, dt);
    // The body sits right of centre by sliding the camera sideways (no rotation, so no skew).
    c.shift = THREE.MathUtils.damp(c.shift, shiftPx.current, kc, dt);
    const perPx = (2 * c.dist * Math.tan(THREE.MathUtils.degToRad((state.camera as THREE.PerspectiveCamera).fov / 2))) / state.size.height;
    const camX = c.target.x - c.shift * perPx;
    state.camera.position.set(camX, c.target.y, c.dist);
    state.camera.lookAt(camX, c.target.y, 0);
    state.camera.updateMatrixWorld();

    // Anchors to canvas pixels for the leader rules and notes (DOM is written by the caller through refs).
    if (group.current) {
      group.current.updateMatrixWorld();
      const out = {} as Record<PlateId, { x: number; y: number }>;
      for (const p of plates) {
        const m = p.id === selected && metric ? metric : p.primary;
        v.fromArray(plateAnchor(p, m, standoff, p.id === selected)).applyMatrix4(group.current.matrixWorld).project(state.camera);
        out[p.id] = { x: (v.x * 0.5 + 0.5) * state.size.width, y: (-v.y * 0.5 + 0.5) * state.size.height };
      }
      v.copy(CENTER).project(state.camera);
      onProject(out, { scale: 1 / perPx, cx: (v.x * 0.5 + 0.5) * state.size.width });
    }
  });

  return (
    <group ref={group}>
      {LAYERS.map((def) => (
        <group key={def.node}>
          {def.prepass && <mesh geometry={geoms[def.node]} material={prepass} renderOrder={1} />}
          <mesh geometry={geoms[def.node]} material={mats[def.node]} renderOrder={def.order} />
        </group>
      ))}
      <mesh geometry={geoms.whole_body} material={contour} renderOrder={6} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
