// Shape checks: the real files in public/data match the TypeScript types.
import { describe, expect, it } from 'vitest';
import { crewData, realCrew, stormForecast } from '../core/testdata';
import { REGIONS } from './types';

const isStatus = (s: unknown) => s === 'green' || s === 'amber' || s === 'red';
const numOrNull = (v: unknown) => v === null || typeof v === 'number';

describe('crew_data.json', () => {
  const d = crewData();
  const metricKeys = Object.keys(d.metrics);

  it('mission and environments', () => {
    expect(Object.keys(d.environments)).toContain(d.mission.environment);
    for (const e of Object.values(d.environments)) expect(typeof e.dose_mSv_day).toBe('number');
    expect(typeof d.career_limit_mSv).toBe('number');
  });

  it('metric metadata', () => {
    for (const m of Object.values(d.metrics)) {
      expect(REGIONS).toContain(m.body_region);
      expect(typeof m.low_side_only).toBe('boolean');
      expect(typeof m.absolute_red.min).toBe('number');
      expect(typeof m.absolute_red.max).toBe('number');
      expect(typeof m.actions.amber).toBe('string');
      expect(typeof m.actions.red).toBe('string');
    }
  });

  it('crew series, baselines, flags, status', () => {
    for (const c of d.crew) {
      expect(c.series.some((r) => r.date === d.mission.today)).toBe(true);
      for (const row of c.series) {
        expect(Object.keys(row).filter((k) => k !== 'date').sort()).toEqual([...metricKeys].sort());
        for (const k of metricKeys) expect(numOrNull((row as Record<string, unknown>)[k])).toBe(true);
      }
      for (const [k, b] of Object.entries(c.baseline)) {
        expect(metricKeys).toContain(k);
        expect(b!.sd).toBeGreaterThan(0);
      }
      for (const f of c.flags) {
        expect(metricKeys).toContain(f.metric);
        expect(['amber', 'red']).toContain(f.severity);
        expect(numOrNull(f.z)).toBe(true);
      }
      for (const r of [...REGIONS, 'overall'] as const) expect(isStatus(c.status[r])).toBe(true);
    }
  });
});

describe('storm_forecast.json', () => {
  const s = stormForecast();
  it('meta', () => {
    expect(s.meta.thresholds.watch).toBeLessThan(s.meta.thresholds.warning);
    expect(s.meta.train_period).toHaveLength(2);
    expect(s.meta.test_period).toHaveLength(2);
    for (const v of Object.values(s.meta.metrics_test)) expect(typeof v).toBe('number');
  });
  it('events', () => {
    expect(s.events.length).toBeGreaterThan(0);
    for (const e of s.events) {
      expect(['none', 'watch', 'warning']).toContain(e.alert_level);
      expect(['train', 'test']).toContain(e.split);
      expect(typeof e.p_storm).toBe('number');
      expect(typeof e.actual_storm).toBe('boolean');
      expect(numOrNull(e.longitude_deg) && numOrNull(e.latitude_deg) && numOrNull(e.cme_speed_kms) && numOrNull(e.lead_time_h)).toBe(true);
      expect(e.storm_onset_time === null || typeof e.storm_onset_time === 'string').toBe(true);
      expect(e.source_location === null || typeof e.source_location === 'string').toBe(true);
      expect(Number.isNaN(Date.parse(e.peak_time))).toBe(false);
    }
  });
});

describe('real_crew.json', () => {
  const r = realCrew();
  it('is the published, not simulated, crew', () => {
    expect(r.meta.simulated).toBe(false);
    const keys = r.analytes.map((a) => a.key);
    for (const c of r.crew) {
      for (const k of Object.keys(c.baseline)) expect(keys).toContain(k);
      for (const row of c.series) {
        expect(['pre', 'post']).toContain(row.phase);
        for (const k of keys) {
          const draw = row[k];
          if (!draw) continue;
          expect(numOrNull(draw.value)).toBe(true);
          expect(typeof draw.excluded).toBe('boolean');
          if (draw.excluded) expect(draw.value).toBeNull();
        }
      }
    }
    for (const f of r.flags) expect(Object.keys(r.meta.counts)).toContain(f.kind);
  });
});
