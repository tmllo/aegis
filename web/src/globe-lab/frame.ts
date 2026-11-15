// Globe lab: the one shared coordinate frame. Every globe-lab file uses these helpers.
//
// Scene units: 1 = one Earth radius (6371 km). The Earth group is Earth-fixed (it does not spin);
// time moves the Sun, Moon and stars around it instead. +Y = north pole, lon 0 / lat 0 = +X,
// lon 90 E = -Z. This matches three's SphereGeometry UVs for an equirectangular map whose left
// edge is lon -180 (u = (lon + 180) / 360), and ll() in src/console/Globe.tsx.
//   scene = (ecef.x, ecef.z, -ecef.y)
import * as THREE from 'three';

export const R_KM = 6371;
/** Scene units per km. */
export const KM = 1 / R_KM;
const D = Math.PI / 180;

/** Point on a sphere of radius r from latitude/longitude in degrees (Earth-fixed scene frame). */
export function ll(lat: number, lon: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(lat * D);
  return out.set(r * c * Math.cos(lon * D), r * Math.sin(lat * D), -r * c * Math.sin(lon * D));
}

/** Latitude/longitude in degrees of a scene-frame direction. */
export function toLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize();
  return { lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / D, lon: Math.atan2(-n.z, n.x) / D };
}

/** Local east / north / up unit vectors at a scene-frame surface direction. */
export function enu(p: THREE.Vector3): { east: THREE.Vector3; north: THREE.Vector3; up: THREE.Vector3 } {
  const up = p.clone().normalize();
  let east = new THREE.Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-10) east = new THREE.Vector3(0, 0, -1); // at a pole: pick lon 90 E
  east.normalize();
  const north = up.clone().cross(east).normalize();
  return { east, north, up };
}

export const julian = (d: Date) => d.getTime() / 86400000 + 2440587.5;

/** Greenwich mean sidereal time in degrees [0, 360). */
export function gmstDeg(d: Date): number {
  const g = 280.46061837 + 360.98564736629 * (julian(d) - 2451545);
  return ((g % 360) + 360) % 360;
}

/** Sky direction (RA/Dec in degrees, J2000-ish) in the Earth-fixed scene frame at time d. */
export function raDec(ra: number, dec: number, d: Date, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  return ll(dec, ra - gmstDeg(d), r, out);
}

function eclToEq(lam: number, beta: number, eps: number): { ra: number; dec: number } {
  const l = lam * D;
  const b = beta * D;
  const e = eps * D;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / D;
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / D;
  return { ra: (ra + 360) % 360, dec };
}

/** Sun RA/Dec in degrees (Astronomical Almanac low precision, about 0.01 deg). */
export function sunRaDec(d: Date): { ra: number; dec: number } {
  const n = julian(d) - 2451545;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * D;
  const lam = L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
  return eclToEq(lam, 0, 23.439 - 4e-7 * n);
}

/** Moon RA/Dec (deg) and distance (km), Astronomical Almanac low precision (about 0.3 deg). */
export function moonRaDec(d: Date): { ra: number; dec: number; km: number } {
  const T = (julian(d) - 2451545) / 36525;
  const s = (a: number, b: number) => Math.sin((a + b * T) * D);
  const c = (a: number, b: number) => Math.cos((a + b * T) * D);
  const lam = 218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22) + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const beta = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const par = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  const eq = eclToEq(lam, beta, 23.439 - 0.0130042 * T);
  return { ...eq, km: R_KM / Math.sin(par * D) };
}

/** Unit vector to the Sun, Earth-fixed scene frame. */
export const sunDir = (d: Date, out = new THREE.Vector3()) => {
  const s = sunRaDec(d);
  return raDec(s.ra, s.dec, d, 1, out);
};

/** Moon position in scene units (about 60 Earth radii away), Earth-fixed scene frame. */
export const moonPos = (d: Date, out = new THREE.Vector3()) => {
  const m = moonRaDec(d);
  return raDec(m.ra, m.dec, d, m.km / R_KM, out);
};
