// Globe lab camera controls with a Google Earth feel. Owns the camera: the pose is derived every
// frame from a KML-style LookAt state (target, range, heading, tilt) in the Earth-local frame.
//   left drag      grab the surface (point under the cursor stays under it), inertia on release
//   wheel / pinch  zoom toward the cursor
//   shift / ctrl / right drag, two-finger drag   heading (horizontal) and tilt (vertical)
//   double click   fly to the point and zoom in
//   keys           arrows pan, +/- zoom, shift+arrows heading/tilt, N north up, U top down, R reset
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clampState, flyLerp, flySeconds, grabRotation, hitSphere, pose, rangeForAlt, rayFrom, rotateState, zoomAt, type LookAt } from './camera-math';
import { enu, KM, ll, toLatLon } from './frame';
import { useLab, type FlyTarget } from './store';

const D = Math.PI / 180;

export interface View { lat: number; lon: number; altKm: number; heading?: number; tilt?: number }

export function stateFor(v: View): LookAt {
  const tilt = (v.tilt ?? 0) * D;
  return clampState({ target: ll(v.lat, v.lon), range: rangeForAlt(v.altKm * KM, tilt), heading: (v.heading ?? 0) * D, tilt });
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

interface Props {
  initial: View;
  home?: View;
  /** The Earth group (Earth-local frame). Default: world = local. */
  earth?: RefObject<THREE.Object3D>;
  /** Live sub-satellite point to follow after a fly-to with follow: 'iss'. */
  follow?: () => { lat: number; lon: number } | null;
}

export function GlobeControls({ initial, home = initial, earth, follow }: Props) {
  const { camera, gl, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const state = useRef<LookAt>(stateFor(initial));
  const omega = useRef(new THREE.Vector3()); // inertia: axis * rad/s, Earth-local
  const zoomPending = useRef({ log: 0, x: 0, y: 0 });
  const fly = useRef<{ from: LookAt; to: LookAt; t: number; dur: number } | null>(null);
  const following = useRef(false);
  const lastReadout = useRef(0);
  const reduced = useMemo(reducedMotion, []);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const flyTo = (to: LookAt) => {
    omega.current.set(0, 0, 0);
    zoomPending.current.log = 0;
    clampState(to);
    if (reduced) {
      state.current = to;
      fly.current = null;
    } else fly.current = { from: { ...state.current, target: state.current.target.clone() }, to, t: 0, dur: flySeconds(state.current, to) };
  };
  const cancel = () => {
    fly.current = null;
    following.current = false;
  };

  // HUD requests: fly-to targets and orientation resets
  useEffect(
    () =>
      useLab.subscribe((s, prev) => {
        if (s.flyTo && s.flyTo !== prev.flyTo) {
          const f: FlyTarget = s.flyTo;
          const cur = state.current;
          flyTo(stateFor({ lat: f.lat, lon: f.lon, altKm: f.altKm ?? (cur.range / KM), heading: f.heading ?? cur.heading / D, tilt: f.tilt ?? cur.tilt / D }));
          following.current = f.follow === 'iss';
        }
        if (s.orient && s.orient !== prev.orient) {
          const cur = state.current;
          flyTo({ ...cur, target: cur.target.clone(), heading: s.orient.kind === 'north' ? 0 : cur.heading, tilt: s.orient.kind === 'top' ? 0 : cur.tilt });
        }
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const el = gl.domElement;
    const ndc = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    const aspect = () => sizeRef.current.width / Math.max(1, sizeRef.current.height);
    const hitAt = (x: number, y: number, miss = true) => hitSphere(rayFrom(pose(state.current), x, y, cam.fov, aspect()), miss);

    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'grab' | 'orbit' | 'touch2' = 'none';
    let grab: THREE.Vector3 | null = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0, t: 0 };
    let dragging = false;
    let pinch = { d: 0, a: 0, cy: 0 };

    const two = () => {
      const [a, b] = [...pointers.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cancel();
      omega.current.set(0, 0, 0);
      start = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
      if (pointers.size === 2) {
        mode = 'touch2';
        const t = two();
        pinch = { d: t.d, a: t.a, cy: t.cy };
        return;
      }
      if (e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey) mode = 'orbit';
      else {
        mode = 'grab';
        const p = ndc(e);
        grab = hitAt(p.x, p.y);
      }
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      dragging = true;
      const now = performance.now();
      const dt = Math.max(1, now - last.t) / 1000;
      if (mode === 'touch2' && pointers.size === 2) {
        const t = two();
        const r = el.getBoundingClientRect();
        const c = { x: ((t.cx - r.left) / r.width) * 2 - 1, y: -((t.cy - r.top) / r.height) * 2 + 1 };
        if (pinch.d > 0 && t.d > 0) state.current = zoomAt(state.current, pinch.d / t.d, c.x, c.y, cam.fov, aspect());
        const s = state.current;
        s.heading -= Math.atan2(Math.sin(t.a - pinch.a), Math.cos(t.a - pinch.a));
        s.tilt += (pinch.cy - t.cy) * 0.006;
        clampState(s);
        pinch = { d: t.d, a: t.a, cy: t.cy };
      } else if (mode === 'orbit') {
        const s = state.current;
        s.heading -= (e.clientX - last.x) * 0.005;
        s.tilt += (last.y - e.clientY) * 0.005;
        clampState(s);
      } else if (mode === 'grab' && grab) {
        const p = ndc(e);
        const cur = hitAt(p.x, p.y);
        if (cur) {
          const q = grabRotation(cur, grab);
          state.current = rotateState(state.current, q);
          // angular velocity for inertia (smoothed)
          const ang = 2 * Math.acos(THREE.MathUtils.clamp(q.w, -1, 1));
          const axis = new THREE.Vector3(q.x, q.y, q.z);
          if (axis.lengthSq() > 1e-14) omega.current.lerp(axis.normalize().multiplyScalar(ang / dt), 0.5);
        }
      }
      last = { x: e.clientX, y: e.clientY, t: now };
    };

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // no inertia if the pointer rested before release, or for anything but a grab
      if (mode !== 'grab' || !dragging || performance.now() - last.t > 80 || reduced) omega.current.set(0, 0, 0);
      if (pointers.size === 0) mode = 'none';
      else if (pointers.size === 1) mode = 'none';
      grab = null;
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cancel();
      omega.current.set(0, 0, 0);
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      const k = e.ctrlKey ? 0.01 : 0.0016; // ctrl+wheel = trackpad pinch on macOS
      const p = ndc(e);
      zoomPending.current.log += e.deltaY * unit * k;
      zoomPending.current.x = p.x;
      zoomPending.current.y = p.y;
    };

    const dbl = (e: MouseEvent) => {
      const p = ndc(e);
      const h = hitAt(p.x, p.y, false);
      if (!h) return;
      const s = state.current;
      const { lat, lon } = toLatLon(h);
      const to = { target: ll(lat, lon), range: s.range * (e.altKey ? 2.5 : 0.4), heading: s.heading, tilt: s.tilt };
      flyTo(to);
    };

    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = state.current;
      const step = Math.min(0.2, s.range * 0.15);
      const { east, north } = enu(s.target);
      const fwd = north.clone().multiplyScalar(Math.cos(s.heading)).addScaledVector(east, Math.sin(s.heading));
      const right = east.clone().multiplyScalar(Math.cos(s.heading)).addScaledVector(north, -Math.sin(s.heading));
      const pan = (dir: THREE.Vector3) => {
        cancel();
        const q = new THREE.Quaternion().setFromAxisAngle(s.target.clone().cross(dir).normalize(), step);
        state.current = rotateState(s, q);
      };
      let handled = true;
      if (e.shiftKey && e.key === 'ArrowLeft') s.heading -= 0.08;
      else if (e.shiftKey && e.key === 'ArrowRight') s.heading += 0.08;
      else if (e.shiftKey && e.key === 'ArrowUp') s.tilt += 0.06;
      else if (e.shiftKey && e.key === 'ArrowDown') s.tilt -= 0.06;
      else if (e.key === 'ArrowUp') pan(fwd);
      else if (e.key === 'ArrowDown') pan(fwd.negate());
      else if (e.key === 'ArrowRight') pan(right);
      else if (e.key === 'ArrowLeft') pan(right.negate());
      else if (e.key === '+' || e.key === '=') zoomPending.current = { log: -0.35, x: 0, y: 0 };
      else if (e.key === '-' || e.key === '_') zoomPending.current = { log: 0.35, x: 0, y: 0 };
      else if (e.key === 'n' || e.key === 'N') flyTo({ ...s, target: s.target.clone(), heading: 0 });
      else if (e.key === 'u' || e.key === 'U') flyTo({ ...s, target: s.target.clone(), tilt: 0 });
      else if (e.key === 'r' || e.key === 'R') flyTo(stateFor(home));
      else handled = false;
      if (handled) {
        clampState(state.current);
        e.preventDefault();
      }
    };

    const menu = (e: Event) => e.preventDefault();
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    el.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', key);
    };
  }, [gl, cam]); // eslint-disable-line react-hooks/exhaustive-deps

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), qa: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3() }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // fly-to
    const f = fly.current;
    if (f) {
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      state.current = flyLerp(f.from, f.to, ease(k));
      if (k >= 1) fly.current = null;
    } else if (following.current && follow) {
      const p = follow();
      if (p) {
        const want = ll(p.lat, p.lon);
        state.current = rotateState(state.current, grabRotation(state.current.target, want));
      }
    }
    // inertia (frame-rate independent decay, ~0.92 per 60 Hz frame)
    const w = omega.current;
    if (!f && w.lengthSq() > 1e-10) {
      const ang = w.length() * dt;
      tmp.qa.setFromAxisAngle(tmp.v.copy(w).normalize(), ang);
      state.current = rotateState(state.current, tmp.qa);
      w.multiplyScalar(Math.pow(0.92, dt * 60));
      if (w.length() < 1e-4) w.set(0, 0, 0);
    }
    // smoothed zoom toward the cursor
    const z = zoomPending.current;
    if (Math.abs(z.log) > 1e-4) {
      const part = reduced ? z.log : z.log * (1 - Math.exp(-dt * 14));
      z.log -= part;
      state.current = zoomAt(state.current, Math.exp(part), z.x, z.y, cam.fov, size.width / Math.max(1, size.height));
    }
    clampState(state.current);

    // apply the pose (Earth-local -> world)
    const p = pose(state.current);
    const g = earth?.current;
    if (g) {
      g.updateWorldMatrix(true, false);
      cam.position.copy(p.eye).applyMatrix4(g.matrixWorld);
      g.matrixWorld.decompose(tmp.v, tmp.q, tmp.s);
      cam.quaternion.copy(tmp.q).multiply(p.quat);
    } else {
      cam.position.copy(p.eye);
      cam.quaternion.copy(p.quat);
    }
    const alt = p.eye.length() - 1;
    const near = Math.max(0.5 * KM, alt * 0.25);
    const far = p.eye.length() + 80;
    if (Math.abs(cam.near - near) / near > 0.02 || cam.far !== far) {
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // readout, 10 Hz
    const now = performance.now();
    if (now - lastReadout.current > 100) {
      lastReadout.current = now;
      const ll0 = toLatLon(state.current.target);
      useLab.getState().setReadout({ lat: ll0.lat, lon: ll0.lon, altKm: alt / KM, heading: state.current.heading / D, tilt: state.current.tilt / D });
    }
  }, -1);

  return null;
}
