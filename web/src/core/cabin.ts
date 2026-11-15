// Cabin: ISS Live! readings against the cabin catalog. Pure functions, no React.
// Units are as observed (mmHg, deg C, percent), not as the ISS Live dictionary states.
import type { Status } from '../data/types';

export interface Bands {
  red_low?: number;
  amber_low?: number;
  amber_high?: number;
  red_high?: number;
}

export interface CabinMetric {
  key: string;
  label: string;
  short: string;
  unit: string;
  /** ISS Live item id. null = planned, not connected to any feed. */
  item: string | null;
  digits: number;
  bands: Bands;
  /** NASA = published NASA limit, Team = our own band, Planned = no feed yet. */
  source: 'NASA' | 'Team' | 'Planned';
  ref?: string;
  tank?: boolean;
  emergency_below?: number;
}

export interface CabinCatalog {
  stale_after_h: number;
  signal_item: string;
  signal_ok_class: string;
  metrics: CabinMetric[];
}

/** One ISS Live item as recorded in the snapshot (Lightstreamer MERGE fields). */
export interface LsItem {
  Value: string;
  TimeStamp: string;
  StatusClass: string;
  CalibratedData: string;
}

export interface LsSnapshot {
  fetchedAtUTC: string;
  items: Record<string, LsItem>;
}

export type Quality = 'live' | 'cached' | 'recorded' | 'simulated';

export interface CabinReading {
  metric: CabinMetric;
  value: number | null;
  /** ms since the epoch. */
  t: number | null;
  ageHours: number | null;
  stale: boolean;
  status: Status | null;
  quality: Quality | null;
}

/**
 * ISS Live TimeStamp is hours since the start of the year, counted from day 1
 * (day-of-year x 24 + UTC hours): time = 1 Jan 00:00 UTC + (TimeStamp - 24) h.
 */
export function issTime(ts: string | number, year: number): number {
  return Date.UTC(year, 0, 1) + (Number(ts) - 24) * 3_600_000;
}

export function statusOfValue(v: number, b: Bands): Status {
  if ((b.red_low != null && v < b.red_low) || (b.red_high != null && v > b.red_high)) return 'red';
  if ((b.amber_low != null && v < b.amber_low) || (b.amber_high != null && v > b.amber_high)) return 'amber';
  return 'green';
}

/** A reading of one catalog metric. `now` decides the age; `quality` says where it came from. */
export function readingOf(metric: CabinMetric, value: number | null, t: number | null, now: number, staleAfterH: number, quality: Quality | null): CabinReading {
  const ok = value != null && Number.isFinite(value);
  const ageHours = t == null ? null : Math.max(0, (now - t) / 3_600_000);
  return {
    metric,
    value: ok ? value : null,
    t,
    ageHours,
    stale: ageHours != null && ageHours > staleAfterH,
    status: ok && Object.keys(metric.bands).length ? statusOfValue(value!, metric.bands) : null,
    quality: ok ? quality : null,
  };
}

/** Catalog readings from a recorded ISS Live snapshot. Its own fetch time is "now". */
export function readingsFromSnapshot(catalog: CabinCatalog, snap: LsSnapshot, quality: Quality = 'recorded'): { readings: CabinReading[]; now: number; signal: boolean } {
  const now = Date.parse(snap.fetchedAtUTC);
  const year = new Date(now).getUTCFullYear();
  const readings = catalog.metrics.map((m) => {
    const it = m.item ? snap.items[m.item] : undefined;
    if (!it) return readingOf(m, null, null, now, catalog.stale_after_h, null);
    return readingOf(m, parseFloat(it.CalibratedData), issTime(it.TimeStamp, year), now, catalog.stale_after_h, quality);
  });
  const sig = snap.items[catalog.signal_item];
  return { readings, now, signal: !!sig && sig.StatusClass === catalog.signal_ok_class };
}

/** Worst status among the readings that have one. */
export function cabinOverall(readings: CabinReading[]): Status {
  const rank: Record<Status, number> = { green: 0, amber: 1, red: 2 };
  return readings.reduce<Status>((w, r) => (r.status && rank[r.status] > rank[w] ? r.status : w), 'green');
}

/** Cabin pressure below its emergency floor: the screen shows the emergency banner. */
export function pressureEmergency(readings: CabinReading[]): boolean {
  return readings.some((r) => r.metric.emergency_below != null && r.value != null && r.value < r.metric.emergency_below);
}

/** A NASA limit is crossed: this always reports to ground. */
export const reportsToGround = (r: CabinReading): boolean => r.metric.source === 'NASA' && r.status === 'red';
