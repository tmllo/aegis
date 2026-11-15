import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { issTime, pressureEmergency, readingsFromSnapshot, statusOfValue, type CabinCatalog, type LsSnapshot } from './cabin';

const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/samples/${f}`, import.meta.url), 'utf8')) as T;
const catalog = read<CabinCatalog>('cabin_catalog.json');
const snap = read<LsSnapshot>('isslive_lightstreamer_eclss_snapshot.json');

describe('cabin', () => {
  it('decodes ISS Live TimeStamp (7649.88 is 14 Nov 17:53 UTC)', () => {
    expect(new Date(issTime('7649.884778333307', 2026)).toISOString().slice(0, 16)).toBe('2026-11-14T17:53');
  });
  it('bands', () => {
    const b = { amber_high: 2.5, red_high: 3 };
    expect(statusOfValue(2.4, b)).toBe('green');
    expect(statusOfValue(2.95, b)).toBe('amber');
    expect(statusOfValue(3.1, b)).toBe('red');
  });
  it('reads the snapshot: planned items stay empty, old items are stale', () => {
    const { readings, signal } = readingsFromSnapshot(catalog, snap);
    const by = Object.fromEntries(readings.map((r) => [r.metric.key, r]));
    expect(signal).toBe(true);
    expect(by['cabin.co'].value).toBeNull();
    expect(by['cabin.humidity'].value).toBeNull();
    expect(by['cabin.pressure'].stale).toBe(false);
    expect(by['cabin.ppco2'].stale).toBe(true);
    expect(by['cabin.ppco2'].value).toBe(Number(snap.items.USLAB000055.CalibratedData));
    expect(pressureEmergency(readings)).toBe(false);
  });
});
