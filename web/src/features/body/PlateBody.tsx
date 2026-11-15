// The anatomical plate: the e^x body model restyled as an engraving.
// A matte paper-white ghost shell, a ghosted skeleton, organs in graded warm
// greys under one side light. Only plates with a status take colour.
// Anatomy: BodyParts3D 4.0 (c) Database Center for Life Science, CC BY 4.0, via human-atlas (MIT).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MetricKey, Status } from '../../data/types';
import { preloadBodyModel, useBodyModel } from './model/bodyModel';
import { inkWeights, plateAnchor, reachOf, type NodeName, type Plate, type PlateId } from './plates';


export const INK: Record<Status | 'paper', string> = {
  paper: '#F4F1EA',
  green: '#5FCF96',
  amber: '#F0B04A',
  red: '#F0564A',
};

/** The haze field behind the body: ember on the left, violet on the right (body.css .fr-haze). */
const RIM = { warm: '#E08A52', cool: '#9C86E8' };

/** Soft round glow, drawn once and shared by every halo and the floor. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
  uniform vec3 uRimWarm;
  uniform vec3 uRimCool;
  uniform float uRim;
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
    // Glass rim: the haze field lights the edges, ember from the left, violet from the right.
    vec3 rim = mix(uRimWarm, uRimCool, smoothstep(-0.55, 0.55, n.x));
    col += rim * fr * uRim * (1.0 - ink);
    float a = uAlpha + uFresnel * fr + uRim * 0.35 * fr * fr;
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
  /** Strength of the two-tone glass rim. */
  rim?: number;
  prepass?: boolean;
  offset?: boolean;
}

const LAYERS: LayerDef[] = [
  { node: 'brain', plate: 'brain', base: '#8E8A7F', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'heart', plate: 'heart', base: '#A6A195', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'blood', plate: 'blood', base: '#6E6B63', opaque: true, alpha: 1, fresnel: 0, power: 2, shade: 1, solid: 1, order: 0 },
  { node: 'bones', plate: null, base: '#D8D3C6', opaque: false, alpha: 0.27, fresnel: 0.55, power: 1.6, shade: 0.9, solid: 1, order: 2, prepass: true, rim: 0.35 },
  { node: 'bones_loadbearing', plate: 'bone', base: '#D8D3C6', opaque: false, alpha: 0, fresnel: 0, power: 2, shade: 1, solid: 1, order: 3, offset: true },
  { node: 'muscle_antigravity', plate: 'muscle', base: '#A39A8E', opaque: false, alpha: 0.05, fresnel: 0.2, power: 2, shade: 0.8, solid: 0.92, order: 3 },
  { node: 'whole_body', plate: 'temp', base: INK.paper, opaque: false, alpha: 0.015, fresnel: 0.5, power: 2.4, shade: 0, solid: 0, order: 5, rim: 1.1 },
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
      uRimWarm: { value: new THREE.Color(RIM.warm) },
      uRimCool: { value: new THREE.Color(RIM.cool) },
      uRim: { value: def.rim ?? 0 },
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
  /** Canvas y of the body's centre (mid height). */
  cy: number;
  /** Current body turn, radians (damped, as drawn). */
  turn: number;
}

const CENTER = new THREE.Vector3(0, 0.875, 0);
const WIDE = 3.7;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function PlateBody({ plates, selected, metric, dose, turnDeg, reducedMotion, neutral, shiftPx, onProject }: PlateBodyProps) {
  const model = useBodyModel();
  // Layers the loaded model actually has: a new model may leave some out.
  const layers = useMemo(() => LAYERS.filter((d) => model[d.node]), [model]);
  const group = useRef<THREE.Group>(null);

  // Own geometries that share the cached buffers, so the cached GLB is never mutated.
  const geoms = useMemo(() => {
    const out = {} as Record<NodeName, THREE.BufferGeometry>;
    for (const def of layers) {
      const src = model[def.node]!;
      if (!src.boundingBox) src.computeBoundingBox();
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
  }, [model, layers]);

  const mats = useMemo(() => Object.fromEntries(layers.map((d) => [d.node, makeMaterial(d)])) as Record<NodeName, THREE.ShaderMaterial>, [layers]);
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

  // Halos: a soft additive glow on each structure that carries a status, and on the selected one.
  const glow = useMemo(glowTexture, []);
  const halos = useMemo(
    () =>
      plates
        .filter((p) => p.node && p.node !== 'whole_body')
        .map((p) => ({
          id: p.id,
          mat: new THREE.SpriteMaterial({ map: glow, color: INK.paper, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        })),
    [plates, glow],
  );
  const haloRefs = useRef(new Map<PlateId, THREE.Sprite>());
  const floor = useMemo(
    () => ({
      disc: new THREE.MeshBasicMaterial({ map: glow, color: INK.paper, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
      ring: new THREE.MeshBasicMaterial({ color: INK.paper, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      ringGeo: new THREE.RingGeometry(0.44, 0.447, 160),
      outerGeo: new THREE.RingGeometry(0.62, 0.623, 160),
      discGeo: new THREE.PlaneGeometry(1.5, 1.5),
    }),
    [glow],
  );
  useEffect(
    () => () => {
      halos.forEach((h) => h.mat.dispose());
    },
    [halos],
  );
  useEffect(
    () => () => {
      glow.dispose();
      floor.disc.dispose();
      floor.ring.dispose();
      floor.ringGeo.dispose();
      floor.outerGeo.dispose();
      floor.discGeo.dispose();
    },
    [glow, floor],
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
    for (const def of layers) {
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
  }, [byId, selected, metric, geoms, mats, neutral, layers]);

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
    reveal.current = { t: reducedMotion ? 1 : 0, reach: !geoms[plate.node] ? 1 : reachOf(geoms[plate.node].boundingBox!, plateAnchor(plate, metric ?? plate.primary, 0)) };
  }, [selected, metric, byId, reducedMotion, geoms]);

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

    for (const def of layers) {
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

    // Halos follow the status breathing; the selected structure glows, the rest dim with the body.
    for (const h of halos) {
      const plate = byId.get(h.id);
      const sprite = haloRefs.current.get(h.id);
      if (!plate || !sprite) continue;
      const isSel = plate.id === selected;
      const flagged = !neutral && plate.status !== 'green';
      const period = flagged && !reducedMotion ? (plate.status === 'red' ? 1 : 2) : 0;
      const breathe = period ? 0.8 + 0.2 * Math.sin((t / period) * Math.PI * 2) : 1;
      const target = (flagged ? (sel && !isSel ? 0.25 : 0.85) : isSel ? 0.35 : 0) * breathe;
      h.mat.opacity = THREE.MathUtils.damp(h.mat.opacity, target, reducedMotion ? 1000 : 8, dt);
      h.mat.color.set(flagged ? INK[plate.status] : INK.paper);
      const m = isSel && metric ? metric : plate.primary;
      sprite.position.fromArray(plateAnchor(plate, m, 0));
    }
    floor.ring.opacity = THREE.MathUtils.damp(floor.ring.opacity, sel ? 0.2 : 0.55, k, dt);

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
      onProject(out, {
        scale: 1 / perPx,
        cx: (v.x * 0.5 + 0.5) * state.size.width,
        cy: (-v.y * 0.5 + 0.5) * state.size.height,
        turn: group.current.rotation.y,
      });
    }
  });

  return (
    <>
    {/* Floor: a lit disc and two thin rings under the feet, like a seat on its pad. */}
    <mesh geometry={floor.discGeo} material={floor.disc} rotation-x={-Math.PI / 2} position-y={0.001} renderOrder={-1} />
    <mesh geometry={floor.ringGeo} material={floor.ring} rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={-1} />
    <mesh geometry={floor.outerGeo} material={floor.disc} rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={-1} />
    <group ref={group}>
      {layers.map((def) => (
        <group key={def.node}>
          {def.prepass && <mesh geometry={geoms[def.node]} material={prepass} renderOrder={1} />}
          <mesh geometry={geoms[def.node]} material={mats[def.node]} renderOrder={def.order} />
        </group>
      ))}
      {geoms.whole_body && <mesh geometry={geoms.whole_body} material={contour} renderOrder={6} />}
      {halos.map((h) => (
        <sprite
          key={h.id}
          material={h.mat}
          scale={h.id === 'bone' || h.id === 'muscle' ? 0.62 : 0.46}
          renderOrder={7}
          ref={(el) => void (el ? haloRefs.current.set(h.id, el) : haloRefs.current.delete(h.id))}
        />
      ))}
    </group>
    </>
  );
}

preloadBodyModel();
