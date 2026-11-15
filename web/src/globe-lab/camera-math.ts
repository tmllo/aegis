// Globe lab camera math (pure, testable). Google Earth / KML LookAt model: the camera looks at a
// target point on the surface from `range` away, rotated by heading (0 = north up, clockwise) and
// tilt (0 = straight down). Everything is in the Earth-local frame of frame.ts (radius 1).
// Technique follows CesiumJS ScreenSpaceCameraController (Apache-2.0): grab-rotate about the
// globe centre so the point under the cursor stays under the cursor.
import * as THREE from 'three';
import { enu, KM } from './frame';

export interface LookAt {
  /** Unit vector of the surface target. */
  target: THREE.Vector3;
  /** Distance from target to camera, scene units. */
  range: number;
  /** Radians, 0 = north up, clockwise. */
  heading: number;
  /** Radians, 0 = looking straight down. */
  tilt: number;
}

export const MIN_ALT = 120 * KM;
export const MAX_RANGE = 80000 * KM;
const TILT_MAX = (75 * Math.PI) / 180;

export interface Pose {
  eye: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Unit ground direction the camera faces (heading direction), used by heading math. */
  fwd: THREE.Vector3;
}

const _m = new THREE.Matrix4();

/** Camera position and orientation for a LookAt state. */
export function pose(s: LookAt): Pose {
  const { east, north, up } = enu(s.target);
  const fwd = north.clone().multiplyScalar(Math.cos(s.heading)).addScaledVector(east, Math.sin(s.heading));
  const dir = up.clone().multiplyScalar(Math.cos(s.tilt)).addScaledVector(fwd, -Math.sin(s.tilt)); // target -> eye
  const camUp = fwd.clone().multiplyScalar(Math.cos(s.tilt)).addScaledVector(up, Math.sin(s.tilt));
  const x = camUp.clone().cross(dir).normalize();
  _m.makeBasis(x, camUp, dir);
  const eye = s.target.clone().normalize().addScaledVector(dir, s.range);
  return { eye, quat: new THREE.Quaternion().setFromRotationMatrix(_m), fwd };
}

export const altitude = (s: LookAt) => pose(s).eye.length() - 1;

/** Largest tilt allowed at this range: 0 when far, 75 deg when close (smooth in log space). */
export function maxTilt(range: number): number {
  const a = Math.log(400 * KM);
  const b = Math.log(8000 * KM);
  const k = THREE.MathUtils.clamp((Math.log(range) - a) / (b - a), 0, 1);
  return TILT_MAX * (1 - k * k * (3 - 2 * k));
}

/** Range at which the camera sits `alt` (scene units) above the surface for this tilt. */
export function rangeForAlt(alt: number, tilt: number): number {
  const c = Math.cos(tilt);
  const R = 1 + alt;
  return -c + Math.sqrt(c * c + R * R - 1);
}

/** Smallest range that keeps the camera at least MIN_ALT above the surface for this tilt. */
export const minRange = (tilt: number) => rangeForAlt(MIN_ALT, tilt);

/** Clamp a state in place to the range and tilt limits. */
export function clampState(s: LookAt): LookAt {
  s.target.normalize();
  s.tilt = THREE.MathUtils.clamp(s.tilt, 0, maxTilt(s.range));
  s.range = THREE.MathUtils.clamp(s.range, minRange(s.tilt), MAX_RANGE);
  s.tilt = THREE.MathUtils.clamp(s.tilt, 0, maxTilt(s.range));
  s.heading = THREE.MathUtils.euclideanModulo(s.heading, Math.PI * 2);
  return s;
}

/** Ray from the camera through normalised device coords (x, y in [-1, 1]), Earth-local frame. */
export function rayFrom(p: Pose, ndcX: number, ndcY: number, fovDeg: number, aspect: number): THREE.Ray {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const d = new THREE.Vector3(ndcX * t * aspect, ndcY * t, -1).normalize().applyQuaternion(p.quat);
  return new THREE.Ray(p.eye.clone(), d);
}

/** Hit point of a ray on the unit sphere; when it misses, the nearest point on the silhouette. */
export function hitSphere(ray: THREE.Ray, allowMiss = true): THREE.Vector3 | null {
  const o = ray.origin;
  const d = ray.direction;
  const b = o.dot(d);
  const c = o.lengthSq() - 1;
  const disc = b * b - c;
  if (disc >= 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0) return o.clone().addScaledVector(d, t);
  }
  if (!allowMiss) return null;
  // closest approach of the ray to the centre, pushed onto the sphere: the limb under the cursor
  const tc = Math.max(0, -b);
  const q = o.clone().addScaledVector(d, tc);
  return q.lengthSq() < 1e-12 ? null : q.normalize();
}

/** Rotate a state rigidly about the globe centre (camera moves with it, so screen relations hold). */
export function rotateState(s: LookAt, q: THREE.Quaternion): LookAt {
  const before = pose(s);
  const fwd = before.fwd.clone().applyQuaternion(q);
  const target = s.target.clone().applyQuaternion(q).normalize();
  const { east, north } = enu(target);
  const heading = Math.atan2(fwd.dot(east), fwd.dot(north));
  return { target, range: s.range, heading: THREE.MathUtils.euclideanModulo(heading, Math.PI * 2), tilt: s.tilt };
}

/** The rotation that moves the point now under the cursor (`now`) to the grabbed point (`grab`).
 *  Applying it to the camera rig puts `grab` back under the cursor. */
export function grabRotation(now: THREE.Vector3, grab: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(now.clone().normalize(), grab.clone().normalize());
}

/** Zoom by `factor` (range multiplier) keeping the surface point under the cursor fixed. */
export function zoomAt(s: LookAt, factor: number, ndcX: number, ndcY: number, fov: number, aspect: number): LookAt {
  const p0 = hitSphere(rayFrom(pose(s), ndcX, ndcY, fov, aspect), false);
  const z = clampState({ ...s, target: s.target.clone(), range: s.range * factor });
  if (!p0) return z;
  const p1 = hitSphere(rayFrom(pose(z), ndcX, ndcY, fov, aspect), false);
  if (!p1) return z;
  return rotateState(z, grabRotation(p1, p0));
}

const angleWrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Fly-to interpolation at eased progress e in [0, 1]: slerp target, log-lerp range plus an arc that
 *  rises mid-flight when the hop is long (like Google Earth), shortest-way heading, linear tilt. */
export function flyLerp(a: LookAt, b: LookAt, e: number): LookAt {
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion().setFromUnitVectors(a.target, b.target);
  const q = qa.clone().slerp(qb, e);
  const target = a.target.clone().applyQuaternion(q).normalize();
  const theta = a.target.angleTo(b.target);
  const peak = Math.max(0, theta * 1.6 - Math.max(a.range, b.range));
  const range = Math.exp(THREE.MathUtils.lerp(Math.log(a.range), Math.log(b.range), e)) + Math.sin(Math.PI * e) * peak;
  return { target, range, heading: a.heading + angleWrap(b.heading - a.heading) * e, tilt: THREE.MathUtils.lerp(a.tilt, b.tilt, e) * (1 - Math.sin(Math.PI * e) * Math.min(1, peak)) };
}

/** Fly duration in seconds for a hop. */
export const flySeconds = (a: LookAt, b: LookAt) => THREE.MathUtils.clamp(1.2 + a.target.angleTo(b.target) * 0.55 + Math.abs(Math.log(b.range / a.range)) * 0.12, 1.2, 2.6);
