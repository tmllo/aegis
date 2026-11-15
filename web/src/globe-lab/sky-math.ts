// Globe lab sky helpers (pure, testable).
import * as THREE from 'three';
import { KM } from './frame';

/** B-V colour index -> effective temperature (Ballesteros 2012). */
export const bvToKelvin = (bv: number) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

/** Blackbody temperature -> linear RGB in [0, 1], normalised so the brightest channel is 1
 *  (Tanner Helland fit, converted from sRGB to linear). */
export function kelvinToRgb(k: number): [number, number, number] {
  const t = THREE.MathUtils.clamp(k, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const lin = (v: number) => {
    const c = THREE.MathUtils.clamp(v, 0, 255) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const out: [number, number, number] = [lin(r), lin(g), lin(b)];
  const m = Math.max(...out);
  return [out[0] / m, out[1] / m, out[2] / m];
}

/** Star colour from B-V, desaturated toward white (stars look pale to the eye). */
export function bvToRgb(bv: number, sat = 0.55): [number, number, number] {
  const c = kelvinToRgb(bvToKelvin(bv));
  return [1 + (c[0] - 1) * sat, 1 + (c[1] - 1) * sat, 1 + (c[2] - 1) * sat];
}

/** How much of the Sun is visible from the camera past the Earth (0 hidden, 1 clear). The Earth is
 *  treated as a sphere of radius 1 + 30 km; the fade spans the limb. Earth-local frame. */
export function sunVisibility(cam: THREE.Vector3, sun: THREE.Vector3): number {
  const b = cam.dot(sun);
  if (b >= 0) return 1; // the Sun is on the camera's side of the Earth's centre
  const h = Math.sqrt(Math.max(cam.lengthSq() - b * b, 0)) - (1 + 30 * KM);
  return THREE.MathUtils.smoothstep(h, -20 * KM, 20 * KM);
}

/** Pogson flux relative to a magnitude-0 star. */
export const flux = (vmag: number) => Math.pow(10, -0.4 * vmag);
