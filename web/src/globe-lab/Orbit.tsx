// ISS orbit track and the clickable globe markers (ISS with its crew, a ground station). Lives
// in the Earth-local group. Markers hide behind the Earth's limb and focus the camera on click.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ll, R_KM } from './frame';
import type { IssSource } from './iss';
import { labTime } from './store';
import './markers.css';

const N = 240; // track samples over one orbit

export function IssTrack({ src }: { src: IssSource }) {
  const dot = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3)), []);
  const line = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.55, depthWrite: false })), [geo]);
  useEffect(
    () => () => {
      geo.dispose();
      (line.material as THREE.Material).dispose();
    },
    [geo, line],
  );
  const last = useRef({ t: -1e15, kind: '' });
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const t0 = labTime.ms;
    const p = src.at(t0);
    const d = dot.current;
    if (d) {
      d.visible = !!p;
      if (p && d.parent) {
        ll(p.lat, p.lon, 1 + p.altKm / R_KM, d.position);
        // constant size on screen (about 6 px at 1080p), never larger than 32 km
        const dist = camera.position.distanceTo(d.parent.localToWorld(v.copy(d.position)));
        d.scale.setScalar(Math.min(1, dist * 0.42));
      }
    }
    if (Math.abs(t0 - last.current.t) < 20000 && last.current.kind === src.kind) return; // redraw every 20 s of sim time
    last.current = { t: t0, kind: src.kind };
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let s = 0; s <= N; s++) {
      const r = src.at(t0 + (s / N) * 92.9 * 60000);
      if (!r) return;
      ll(r.lat, r.lon, 1 + r.altKm / R_KM, v);
      a.setXYZ(s, v.x, v.y, v.z);
    }
    a.needsUpdate = true;
    geo.computeBoundingSphere();
  });
  return (
    <group>
      <primitive object={line} renderOrder={6} />
      <mesh ref={dot} renderOrder={7}>
        <sphereGeometry args={[0.005, 16, 16]} />
        <meshBasicMaterial color={new THREE.Color(2.4, 5.2, 6.4)} toneMapped={false} />
      </mesh>
    </group>
  );
}

export interface MarkerProps {
  id: string;
  title: string;
  line?: string;
  status?: string;
  /** Earth-local position, updated every frame. */
  where: () => THREE.Vector3 | null;
  active?: boolean;
  onFocus: () => void;
}

const _cam = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** A labelled point on or above the globe. Hidden when the Earth is in front of it. */
export function Marker({ title, line, status, where, active, onFocus }: MarkerProps) {
  const g = useRef<THREE.Group>(null);
  const el = useRef<HTMLButtonElement>(null);
  useFrame(({ camera }) => {
    const grp = g.current;
    const p = where();
    if (!grp || !grp.parent) return;
    if (!p) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    grp.position.copy(p);
    // camera in the Earth-local frame; hidden when the ray to the marker passes through the Earth
    _inv.copy(grp.parent.matrixWorld).invert();
    _cam.copy(camera.position).applyMatrix4(_inv);
    const d = p.clone().sub(_cam);
    const len = d.length();
    d.divideScalar(len);
    const b = _cam.dot(d);
    const c = _cam.lengthSq() - 1;
    const h = b * b - c;
    const hidden = h > 0 && -b - Math.sqrt(h) > 0 && -b - Math.sqrt(h) < len - 1e-4;
    if (el.current) {
      el.current.dataset.hidden = String(hidden);
      el.current.tabIndex = hidden ? -1 : 0;
    }
  });
  return (
    <group ref={g}>
      <Html zIndexRange={[12, 11]} style={{ pointerEvents: 'none' }}>
        <button
          ref={el}
          type="button"
          className="gm"
          data-status={status}
          aria-pressed={!!active}
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="gm-dot" aria-hidden />
          <span className="gm-text">
            <b>{title}</b>
            {line && <small>{line}</small>}
          </span>
        </button>
      </Html>
    </group>
  );
}
