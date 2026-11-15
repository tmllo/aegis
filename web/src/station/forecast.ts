// Radiation forecast for the station screen. Pure: no React, no fetch. Everything is derived from
// storm_forecast.json (Tomas's held-out model scores) and stated physics; each output keeps its label.
//
// What the model predicts (docs/ARCHITECTURE.md section 4): the chance that a flare is followed by a
// GOES >10 MeV proton storm within meta.horizon_hours. It does not predict dose.
//
//  scan()        the forecast at the newest data point: combined storm chance over the open window,
//                the riskiest flare, when particles would arrive (from past storms' real lead times),
//                when an eruption front (CME) would arrive (distance / speed), and the magnetic path.
//  whatIf()      "a flare like this happens now": the storm chance estimated from the most similar
//                flares the model scored (nearest neighbours over class, longitude, CME, CME speed).
import type { AlertLevel, EnvironmentId, FlareEvent, StormForecast } from '../data/types';

const H = 3600e3;
export const AU_KM = 149_597_871;
/** Solar sidereal rotation (25.38 d), rad/s, and nominal slow solar wind, km/s. */
const OMEGA = (2 * Math.PI) / (25.38 * 86400);
const WIND_KMS = 400;
/** Crew distance from the Sun by location, AU. */
export const CREW_AU: Record<EnvironmentId, number> = { iss: 1, moon: 1, transit: 1.25, mars: 1.52 };
/** What stands between the crew and the particles (general physics). */
export const SHIELD: Record<EnvironmentId, { word: string; why: string }> = {
  iss: { word: 'Strong', why: "Earth's magnetic field turns most particles away" },
  moon: { word: 'None', why: 'No magnetic field and no air: only walls and regolith' },
  transit: { word: 'None', why: 'Open space: only the cabin walls' },
  mars: { word: 'Partial', why: 'Thin air, no global magnetic field' },
};

/** Longitude (deg west) where the crew's Parker-spiral field line leaves the Sun. ~W60 at 1 AU. */
export const footpointDeg = (au: number) => ((OMEGA * au * AU_KM) / WIND_KMS) * (180 / Math.PI);

export type Path = 'direct' | 'partial' | 'side';
export const PATH_WORD: Record<Path, string> = { direct: 'Direct line', partial: 'Partly connected', side: 'Off to the side' };
export function pathOf(lon: number | null, env: EnvironmentId): { path: Path; gap: number; foot: number } | null {
  if (lon == null) return null;
  const foot = footpointDeg(CREW_AU[env]);
  const gap = Math.abs(lon - foot);
  return { path: gap <= 30 ? 'direct' : gap <= 70 ? 'partial' : 'side', gap, foot };
}

/** Hours for an eruption front at `kms` to reach the crew (constant speed: a rough, early estimate). */
export const frontHours = (kms: number, env: EnvironmentId) => (CREW_AU[env] * AU_KM) / kms / 3600;

export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
};

export interface Arrival {
  /** hours from flare peak to proton-storm onset, from past storms in the file */
  p25: number;
  median: number;
  p75: number;
  n: number;
}
/** How long after a flare past storms actually started (real onsets in the test years). */
export function arrivalStats(storm: StormForecast): Arrival {
  const leads = storm.events.filter((e) => e.actual_storm && e.lead_time_h != null).map((e) => e.lead_time_h!);
  return { p25: quantile(leads, 0.25), median: quantile(leads, 0.5), p75: quantile(leads, 0.75), n: leads.length };
}

export const levelFor = (p: number, th: StormForecast['meta']['thresholds']): AlertLevel => (p >= th.warning ? 'warning' : p >= th.watch ? 'watch' : 'none');

export interface Scan {
  /** time of the newest data point (the scan clock) */
  at: number;
  /** flares inside the open window (horizon hours before the scan), newest first */
  open: FlareEvent[];
  /** chance that at least one open flare brings a storm: 1 - prod(1 - p) */
  combined: number;
  level: AlertLevel;
  top: FlareEvent | null;
  /** if the top flare brings a storm: estimated onset window, epoch ms */
  window: { from: number; likely: number; to: number } | null;
  /** hours of the top flare's watch window still open */
  hoursLeft: number;
  front: { kms: number; hours: number; at: number } | null;
  path: ReturnType<typeof pathOf>;
  arrival: Arrival;
  /** flares in the last 30 days for the Sun map */
  month: FlareEvent[];
}

export function scan(storm: StormForecast, env: EnvironmentId, at?: number): Scan {
  const ev = [...storm.events].sort((a, b) => Date.parse(a.peak_time) - Date.parse(b.peak_time));
  const clock = at ?? (ev.length ? Date.parse(ev[ev.length - 1].peak_time) : Date.now());
  const hz = storm.meta.horizon_hours * H;
  const open = ev.filter((e) => Date.parse(e.peak_time) <= clock && clock - Date.parse(e.peak_time) <= hz).reverse();
  const combined = 1 - open.reduce((a, e) => a * (1 - e.p_storm), 1);
  const top = open.reduce<FlareEvent | null>((a, e) => (!a || e.p_storm > a.p_storm ? e : a), null);
  const arrival = arrivalStats(storm);
  const t0 = top ? Date.parse(top.peak_time) : 0;
  return {
    at: clock,
    open,
    combined,
    level: levelFor(combined, storm.meta.thresholds),
    top,
    window: top ? { from: t0 + arrival.p25 * H, likely: t0 + arrival.median * H, to: t0 + arrival.p75 * H } : null,
    hoursLeft: top ? Math.max(0, (t0 + hz - clock) / H) : 0,
    front: top?.has_linked_cme && top.cme_speed_kms ? { kms: top.cme_speed_kms, hours: frontHours(top.cme_speed_kms, env), at: t0 + frontHours(top.cme_speed_kms, env) * H } : null,
    path: top ? pathOf(top.longitude_deg, env) : null,
    arrival,
    month: ev.filter((e) => clock - Date.parse(e.peak_time) <= 30 * 24 * H && Date.parse(e.peak_time) <= clock),
  };
}

export interface WhatIf {
  p: number;
  level: AlertLevel;
  /** how many similar real flares the estimate rests on, and how many of them were followed by a storm */
  n: number;
  storms: number;
}
/** Flux of a class string: C1 = 1e-6, M1 = 1e-5, X1 = 1e-4. */
export const fluxOf = (cls: string) => ({ A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 })[cls[0] as 'C'] * Number(cls.slice(1) || 1);
export const classOf = (flux: number) => {
  const [l, b] = flux >= 1e-4 ? ['X', 1e-4] : flux >= 1e-5 ? ['M', 1e-5] : ['C', 1e-6];
  return `${l}${(flux / (b as number)).toFixed(1)}`;
};

/** Storm chance for a hypothetical flare: weighted mean of the model's scores on the k most similar real flares. */
export function whatIf(storm: StormForecast, f: { flux: number; lon: number; cme: boolean; kms: number }, k = 25): WhatIf {
  const fx = (e: { flux: number; lon: number; cme: boolean; kms: number }) => [Math.log10(e.flux) * 1.0, e.lon / 45, e.cme ? 1.5 : 0, e.cme ? Math.log10(Math.max(200, e.kms)) * 2 : 0];
  const q = fx(f);
  const scored = storm.events
    .filter((e) => e.longitude_deg != null)
    .map((e) => {
      const v = fx({ flux: e.class_flux, lon: e.longitude_deg!, cme: e.has_linked_cme, kms: e.cme_speed_kms ?? 0 });
      return { e, d: Math.hypot(...v.map((x, i) => x - q[i])) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  const w = scored.map((s) => 1 / (0.05 + s.d));
  const sw = w.reduce((a, b) => a + b, 0) || 1;
  const p = scored.reduce((a, s, i) => a + s.e.p_storm * w[i], 0) / sw;
  return { p, level: levelFor(p, storm.meta.thresholds), n: scored.length, storms: scored.filter((s) => s.e.actual_storm).length };
}

export const hhmm = (h: number) => {
  const m = Math.max(0, Math.round(h * 60));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};
export const utc = (ms: number) => new Date(ms).toUTCString().slice(5, 22) + ' UTC';
