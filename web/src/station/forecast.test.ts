import { describe, expect, it } from 'vitest';
import storm from '../../public/data/storm_forecast.json';
import type { StormForecast } from '../data/types';
import { arrivalStats, classOf, fluxOf, footpointDeg, frontHours, levelFor, pathOf, scan, whatIf } from './forecast';

const S = storm as unknown as StormForecast;

describe('station forecast', () => {
  it('arrival window comes from real storm onsets in the file', () => {
    const a = arrivalStats(S);
    expect(a.n).toBe(S.events.filter((e) => e.actual_storm && e.lead_time_h != null).length);
    expect(a.p25).toBeLessThanOrEqual(a.median);
    expect(a.median).toBeLessThanOrEqual(a.p75);
  });
  it('scan combines the open flares into one chance and keeps the model thresholds', () => {
    const s = scan(S, 'moon');
    expect(s.combined).toBeGreaterThanOrEqual((s.top?.p_storm ?? 0) - 1e-9);
    expect(s.combined).toBeLessThanOrEqual(1);
    expect(s.level).toBe(levelFor(s.combined, S.meta.thresholds));
  });
  it('a big fast western flare scores higher than a small eastern one', () => {
    const big = whatIf(S, { flux: fluxOf('X2'), lon: 55, cme: true, kms: 1800 });
    const small = whatIf(S, { flux: fluxOf('C2'), lon: -60, cme: false, kms: 0 });
    expect(big.p).toBeGreaterThan(small.p);
  });
  it('physics helpers', () => {
    expect(footpointDeg(1)).toBeGreaterThan(50);
    expect(footpointDeg(1)).toBeLessThan(70);
    expect(pathOf(60, 'iss')?.path).toBe('direct');
    expect(pathOf(-60, 'iss')?.path).toBe('side');
    expect(frontHours(1000, 'iss')).toBeCloseTo(41.6, 0);
    expect(classOf(fluxOf('M5.0'))).toBe('M5.0');
  });
});
