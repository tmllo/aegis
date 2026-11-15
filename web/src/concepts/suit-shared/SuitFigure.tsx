// Ana in the e^x sensor suit (public/models/ana-suit.glb), turning slowly.
// Tap a sensor (the 56 px marker or the suit near it) to select it: the figure
// turns that sensor to the camera and the camera eases in.
import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SENSORS, SENSOR_NODE, SENSOR_NAME, type SensorId } from './suitData';

export const SUIT_URL = `${import.meta.env.BASE_URL}models/ana-suit.glb`;

/** Axis the figure turns around (body centre in the GLB, metres). */
const AXIS_Z = 0.05;

interface SensorPoint {
  id: SensorId;
  pos: THREE.Vector3;
  /** Angle of the sensor around the turn axis; 0 = facing +z (the camera). */
  angle: number;
}

/** GLB exported every material as BLEND: make skin and suit opaque, cut hair with alpha test. */
function fixMaterials(root: THREE.Object3D, traceColor?: string) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // skinned bounds are bind-pose bounds
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as THREE.MeshPhysicalMaterial[]) {
      const hairy = /eyebrow|eyelash|ponytail/i.test(m.name);
      if (/high-poly/.test(m.name)) continue; // eyes: keep the exported blend (cornea over iris)
      m.transparent = false;
      m.depthWrite = true;
      m.opacity = 1;
      m.alphaTest = hairy ? 0.45 : 0;
      // the MPFB skin is procedural in Blender and exports near white: give it a skin tone
      if (/ana_body\.(body|ears)$/.test(m.name)) m.color = new THREE.Color('#c68f74');
      if (/ana_body\.lips$/.test(m.name)) m.color = new THREE.Color('#a8665e');
      if (traceColor && /ex_led|ex_trace/.test(m.name)) {
        m.emissive = new THREE.Color(traceColor);
        if (/ex_led/.test(m.name)) m.emissiveIntensity = 6;
      }
      m.needsUpdate = true;
    }
  });
}

function sensorPoints(root: THREE.Object3D): SensorPoint[] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  return SENSORS.map((id) => {
    const node = root.getObjectByName(SENSOR_NODE[id]);
    if (!node) return { id, pos: new THREE.Vector3(0, 1, 0.2), angle: 0 };
    box.setFromObject(node);
    box.getCenter(c);
    const pos = new THREE.Vector3(c.x, c.y, box.max.z);
    return { id, pos, angle: Math.atan2(c.x, box.max.z - AXIS_Z) };
  });
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

export interface SuitFigureProps {
  selected: SensorId | null;
  onSelect: (id: SensorId) => void;
  /** CSS colour of the glow on each sensor (status colour). */
  glow: (id: SensorId) => string;
  /** Recolour the suit's traces and hub LED (concept accent). */
  traceColor?: string;
  /** Content of each 56 px marker button. */
  marker: (id: SensorId, active: boolean) => ReactNode;
  /** Camera when nothing is selected. */
  view: { pos: [number, number, number]; target: [number, number, number] };
  /** Distance to a selected sensor, and a sideways shift so a panel can sit beside it. */
  focus?: { distance: number; shiftX: number };
  /** Turn speed in rad/s. */
  spin?: number;
  /** Start angle (radians). */
  startAngle?: number;
}

export function SuitFigure({
  selected,
  onSelect,
  glow,
  traceColor,
  marker,
  view,
  focus = { distance: 1.5, shiftX: 0 },
  spin = 0.12,
  startAngle = -0.35,
}: SuitFigureProps) {
  const { scene } = useGLTF(SUIT_URL);
  const points = useMemo(() => {
    fixMaterials(scene, traceColor);
    return sensorPoints(scene);
  }, [scene, traceColor]);

  const turn = useRef<THREE.Group>(null);
  const markers = useRef<Record<string, HTMLDivElement | null>>({});
  const sprites = useRef<Record<string, THREE.Sprite | null>>({});
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...view.target));
  const rot = useRef(startAngle);

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const sel = points.find((p) => p.id === selected);
    if (sel) {
      // shortest way round to face the sensor
      let delta = -sel.angle - rot.current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      rot.current += delta * (1 - Math.exp(-d * 4));
    } else if (!reduced) {
      rot.current += spin * d;
    }
    if (turn.current) turn.current.rotation.y = rot.current;

    // camera
    const wantTarget = sel
      ? new THREE.Vector3(focus.shiftX, sel.pos.y, AXIS_Z)
      : new THREE.Vector3(...view.target);
    const wantPos = sel
      ? new THREE.Vector3(focus.shiftX, sel.pos.y + 0.04, AXIS_Z + Math.hypot(sel.pos.x, sel.pos.z - AXIS_Z) + focus.distance)
      : new THREE.Vector3(...view.pos);
    const k = reduced ? 1 : 1 - Math.exp(-d * 3);
    camera.position.lerp(wantPos, k);
    look.current.lerp(wantTarget, k);
    camera.lookAt(look.current);

    // markers face check + glow pulse
    const t = state.clock.elapsedTime;
    for (const p of points) {
      const facing = Math.cos(p.angle + rot.current);
      const el = markers.current[p.id];
      if (el) {
        const on = facing > 0.1;
        el.style.opacity = on ? '1' : '0';
        el.style.pointerEvents = on ? 'auto' : 'none';
      }
      const sp = sprites.current[p.id];
      if (sp) {
        const base = p.id === selected ? 0.16 : 0.09;
        const s = base * (reduced ? 1 : 1 + 0.18 * Math.sin(t * 2.2 + p.angle * 3));
        sp.scale.setScalar(s);
        (sp.material as THREE.SpriteMaterial).opacity = facing > -0.2 ? 0.9 : 0;
      }
    }
  });

  const tex = glowTexture();

  const pickNearest = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!turn.current) return;
    const local = turn.current.worldToLocal(e.point.clone()).add(new THREE.Vector3(0, 0, AXIS_Z));
    let best: SensorPoint | null = null;
    let bestD = 0.16;
    for (const p of points) {
      const dd = p.pos.distanceTo(local);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    if (best) onSelect(best.id);
  };

  return (
    <group ref={turn}>
      <group position={[0, 0, -AXIS_Z]}>
        <primitive object={scene} onClick={pickNearest} />
        {points.map((p) => (
          <group key={p.id} position={p.pos}>
            <sprite
              ref={(s) => {
                sprites.current[p.id] = s;
              }}
              renderOrder={5}
            >
              <spriteMaterial map={tex} color={glow(p.id)} transparent depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <Html center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
              <div
                ref={(el) => {
                  markers.current[p.id] = el;
                }}
                className="suit-marker-wrap"
                data-dim={(selected && p.id !== selected) || undefined}
              >
                <button
                  type="button"
                  className="suit-marker"
                  data-sensor={p.id}
                  data-active={p.id === selected || undefined}
                  aria-label={SENSOR_NAME[p.id]}
                  aria-pressed={p.id === selected}
                  onClick={() => onSelect(p.id)}
                >
                  {marker(p.id, p.id === selected)}
                </button>
              </div>
            </Html>
          </group>
        ))}
      </group>
    </group>
  );
}

useGLTF.preload(SUIT_URL);
