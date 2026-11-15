// Globe lab ISS: sub-satellite point from the bundled CelesTrak TLE (public/orbits/iss.tle), two-body
// propagation (no J2), the same model as src/console/Globe.tsx, kept local so the lab never
// depends on a file another session is editing. Good for a ground track, not for conjunctions.
import { useEffect, useState } from 'react';
import { R_KM } from './frame';

const MU = 398600.4418;
export interface Tle { epoch: number; i: number; raan: number; e: number; argp: number; m0: number; n: number }

export function parseTle(text: string): Tle | null {
  const lines = text.trim().split('\n').map((l) => l.trimEnd());
  const l1 = lines.find((l) => l.startsWith('1 '));
  const l2 = lines.find((l) => l.startsWith('2 '));
  if (!l1 || !l2) return null;
  const yy = Number(l1.slice(18, 20));
  const doy = Number(l1.slice(20, 32));
  const epoch = Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 86400000;
  const d = (a: number, b: number) => (Number(l2.slice(a, b)) * Math.PI) / 180;
  return { epoch, i: d(8, 16), raan: d(17, 25), e: Number(`0.${l2.slice(26, 33).trim()}`), argp: d(34, 42), m0: d(43, 51), n: (Number(l2.slice(52, 63)) * 2 * Math.PI) / 86400 };
}

/** Latitude, longitude (deg) and altitude (km) at time t (ms). */
export function issAt(k: Tle, t: number): { lat: number; lon: number; altKm: number } {
  const a = Math.cbrt(MU / (k.n * k.n));
  const M = k.m0 + k.n * ((t - k.epoch) / 1000);
  let E = M;
  for (let j = 0; j < 8; j++) E -= (E - k.e * Math.sin(E) - M) / (1 - k.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + k.e) * Math.sin(E / 2), Math.sqrt(1 - k.e) * Math.cos(E / 2));
  const r = a * (1 - k.e * Math.cos(E));
  const u = k.argp + nu;
  const x = r * (Math.cos(k.raan) * Math.cos(u) - Math.sin(k.raan) * Math.sin(u) * Math.cos(k.i));
  const y = r * (Math.sin(k.raan) * Math.cos(u) + Math.cos(k.raan) * Math.sin(u) * Math.cos(k.i));
  const z = r * Math.sin(u) * Math.sin(k.i);
  const jd = t / 86400000 + 2440587.5;
  const gmst = ((280.46061837 + 360.98564736629 * (jd - 2451545)) * Math.PI) / 180;
  const lon = (((Math.atan2(y, x) - gmst) * 180) / Math.PI) % 360;
  return { lat: (Math.asin(z / r) * 180) / Math.PI, lon: ((lon + 540) % 360) - 180, altKm: r - R_KM };
}

let cache: Promise<Tle | null> | null = null;
export function useTle(): Tle | null {
  const [tle, setTle] = useState<Tle | null>(null);
  useEffect(() => {
    cache ??= fetch(`${import.meta.env.BASE_URL}orbits/iss.tle`).then((r) => (r.ok ? r.text() : '')).then(parseTle, () => null);
    let alive = true;
    void cache.then((t) => alive && setTle(t));
    return () => {
      alive = false;
    };
  }, []);
  return tle;
}
