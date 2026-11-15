// Globe lab ISS: sub-satellite point from the bundled CelesTrak TLE (public/orbits/iss.tle), two-body
// propagation (no J2), the same model as src/console/Globe.tsx, kept local so the lab never
// depends on a file another session is editing. Good for a ground track, not for conjunctions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson, hasServer } from '../data/http';
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

/* ---------- server orbit (SGP4 from the e^x data core) with the TLE as offline fallback ---------- */

export interface OrbitPoint { t: number; lat: number; lon: number; altKm: number }
interface ApiOrbit { points: { t: string; lat: number; lon: number; alt_km: number }[] }

/** Source of ISS positions: server SGP4 samples when the data core answers, else the bundled TLE. */
export interface IssSource {
  at: (ms: number) => { lat: number; lon: number; altKm: number } | null;
  kind: 'server' | 'tle' | 'none';
}

const deg = Math.PI / 180;
function interp(a: OrbitPoint, b: OrbitPoint, k: number) {
  // interpolate on the sphere so the date line does not tear the track
  const v = (p: OrbitPoint) => [Math.cos(p.lat * deg) * Math.cos(p.lon * deg), Math.cos(p.lat * deg) * Math.sin(p.lon * deg), Math.sin(p.lat * deg)];
  const [x0, y0, z0] = v(a);
  const [x1, y1, z1] = v(b);
  const x = x0 + (x1 - x0) * k;
  const y = y0 + (y1 - y0) * k;
  const z = z0 + (z1 - z0) * k;
  const r = Math.hypot(x, y, z) || 1;
  return { lat: Math.asin(z / r) / deg, lon: Math.atan2(y, x) / deg, altKm: a.altKm + (b.altKm - a.altKm) * k };
}

/** ISS positions for any sim time. Fetches 100 min of 20 s SGP4 samples around `now` from
 *  /api/orbit and refetches when the clock leaves the window; falls back to the TLE. */
export function useIssSource(now: () => number): IssSource {
  const tle = useTle();
  const [pts, setPts] = useState<OrbitPoint[] | null>(null);
  const [want, setWant] = useState(() => now());
  useEffect(() => {
    let alive = true;
    void hasServer().then((up) => {
      if (!up || !alive) return;
      const at = new Date(want - 5 * 60000).toISOString();
      getJson<ApiOrbit>(`api/orbit?subject=iss&minutes=100&step_s=20&at=${encodeURIComponent(at)}`, 20000)
        .then((o) => {
          if (!alive || !o.points?.length) return;
          setPts(o.points.map((p) => ({ t: Date.parse(p.t), lat: p.lat, lon: p.lon, altKm: p.alt_km })));
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, [want]);

  const lastAsk = useRef(0);
  return useMemo<IssSource>(() => ({
    kind: pts ? 'server' : tle ? 'tle' : 'none',
    at: (ms: number) => {
      if (pts && pts.length > 1) {
        const t0 = pts[0].t;
        const t1 = pts[pts.length - 1].t;
        if (ms >= t0 && ms <= t1) {
          const step = (t1 - t0) / (pts.length - 1);
          const i = Math.min(pts.length - 2, Math.floor((ms - t0) / step));
          return interp(pts[i], pts[i + 1], (ms - pts[i].t) / (pts[i + 1].t - pts[i].t));
        }
        // outside the window (time scrubbed or sped up): ask again, at most every 3 s
        if (performance.now() - lastAsk.current > 3000) {
          lastAsk.current = performance.now();
          setTimeout(() => setWant(ms), 0);
        }
      }
      return tle ? issAt(tle, ms) : null;
    },
  }), [pts, tle]);
}
