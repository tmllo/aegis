// Cabin data access. Server first (/api/observations, Tomas's generic view),
// else the recorded ISS Live snapshot in public/samples. Swap here only.
import { useEffect, useState } from 'react';
import {
  readingOf,
  readingsFromSnapshot,
  type CabinCatalog,
  type CabinReading,
  type LsSnapshot,
  type Quality,
} from '../core/cabin';
import { getJson, hasServer } from './http';

export interface CabinData {
  readings: CabinReading[];
  /** The clock the ages are measured against. */
  now: number;
  /** ISS ground link (TIME_000001 status class). */
  signal: boolean;
  origin: 'server' | 'sample';
}

/** Row of /api/observations (docs/backend/DATA-CORE.md, observation record). */
interface ApiObservation {
  metric: string;
  t: string;
  value: number;
  quality?: Quality;
}

async function fromServer(catalog: CabinCatalog): Promise<CabinData | null> {
  if (!(await hasServer())) return null;
  const rows = await getJson<ApiObservation[]>('api/observations?subject=iss&kind=cabin');
  if (!Array.isArray(rows) || !rows.length) return null;
  const latest = new Map<string, ApiObservation>();
  for (const r of rows) {
    const prev = latest.get(r.metric);
    if (!prev || Date.parse(r.t) > Date.parse(prev.t)) latest.set(r.metric, r);
  }
  const now = Date.now();
  const readings = catalog.metrics.map((m) => {
    const o = latest.get(m.key);
    return o
      ? readingOf(m, o.value, Date.parse(o.t), now, catalog.stale_after_h, o.quality ?? 'live')
      : readingOf(m, null, null, now, catalog.stale_after_h, null);
  });
  return { readings, now, signal: true, origin: 'server' };
}

let cache: Promise<CabinData> | null = null;

export function loadCabin(): Promise<CabinData> {
  cache ??= (async () => {
    const catalog = await getJson<CabinCatalog>('samples/cabin_catalog.json');
    const live = await fromServer(catalog).catch(() => null);
    if (live) return live;
    const snap = await getJson<LsSnapshot>('samples/isslive_lightstreamer_eclss_snapshot.json');
    return { ...readingsFromSnapshot(catalog, snap), origin: 'sample' as const };
  })();
  cache.catch(() => (cache = null));
  return cache;
}

export function useCabin(): { cabin: CabinData | null; error: string | null } {
  const [cabin, setCabin] = useState<CabinData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadCabin().then(
      (c) => alive && setCabin(c),
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { cabin, error };
}
