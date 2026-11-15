import { describe, expect, it } from 'vitest';
import { crewData } from './testdata';
import { contextFor, scoreCheckIn, scoreDay, scoreMetric, statusOn, windowMean } from './scoring';
import type { Baseline, MetricKey, MetricMeta, SeriesRow } from '../data/types';

const data = crewData();

describe('rule parity with ml/crew_flags.py (golden, from crew_data.json)', () => {
  it('has crew to check', () => {
    expect(data.crew.length).toBeGreaterThan(0);
  });

  for (const member of data.crew) {
    it(`reproduces today's status for ${member.id}`, () => {
      const { status } = statusOn(member, data);
      expect(status).toEqual(member.status);
    });

    it(`reproduces the stored flags for ${member.id}`, () => {
      // The file keeps flags for a recent window. Rescore every day in that window
      // and expect the same set of (date, metric, severity) with the same z.
      const dates = [...new Set(member.flags.map((f) => f.date))].sort();
      if (dates.length === 0) return;
      const first = member.series.findIndex((r) => r.date === dates[0]);
      const ctx = contextFor(data);
      const mine: { date: string; metric: MetricKey; severity: string; z: number | null }[] = [];
      for (let i = first; i < member.series.length; i++) {
        for (const s of scoreDay(member, data.metrics, i, ctx)) {
          if (s.status !== 'green') mine.push({ date: member.series[i].date, metric: s.metric, severity: s.status, z: s.z });
        }
      }
      const key = (f: { date: string; metric: string; severity: string }) => `${f.date}|${f.metric}|${f.severity}`;
      expect(mine.map(key).sort()).toEqual(member.flags.map(key).sort());
      for (const f of member.flags) {
        const m = mine.find((x) => key(x) === key(f))!;
        if (f.z === null) expect(m.z).toBeNull();
        else expect(Math.abs((m.z as number) - f.z)).toBeLessThanOrEqual(0.005 + 1e-9);
      }
    });
  }
});

describe('contract rule, unit cases', () => {
  const meta = (over: Partial<MetricMeta> = {}): MetricMeta => ({
    label: 'x', unit: 'u', body_region: 'heart', explain: '', how_to_measure: '',
    actions: { amber: 'a', red: 'r' }, absolute_red: { min: 0, max: 1000 }, low_side_only: false, ...over,
  });
  const base: Baseline = { mean: 100, sd: 10 };
  const ctx = { envDosePerDay: 1, careerLimit_mSv: 600 };
  const rows = (metric: MetricKey, values: (number | null)[]): SeriesRow[] =>
    values.map((v, i) => ({ date: `d${i}`, [metric]: v }) as unknown as SeriesRow);

  it('averages today with the previous 2 days and leaves missing days out', () => {
    expect(windowMean(rows('hr', [50, 100, 110, 120]), 3, 'hr')).toBe(110);
    expect(windowMean(rows('hr', [100, null, 120]), 2, 'hr')).toBe(110);
    expect(windowMean(rows('hr', [null, null, 120]), 2, 'hr')).toBe(120);
    expect(windowMean(rows('hr', [100, 110, null]), 2, 'hr')).toBeNull();
  });

  it('amber at 2, red at 3, on the 3-day mean (inclusive)', () => {
    expect(scoreMetric('hr', meta(), base, rows('hr', [119, 119, 119]), 2, ctx)!.status).toBe('green');
    expect(scoreMetric('hr', meta(), base, rows('hr', [120, 120, 120]), 2, ctx)!.status).toBe('amber');
    expect(scoreMetric('hr', meta(), base, rows('hr', [130, 130, 130]), 2, ctx)!.status).toBe('red');
    // one bad day is diluted by two normal days
    expect(scoreMetric('hr', meta(), base, rows('hr', [100, 100, 140]), 2, ctx)!.status).toBe('green');
    // two-sided
    expect(scoreMetric('hr', meta(), base, rows('hr', [80, 80, 80]), 2, ctx)!.status).toBe('amber');
  });

  it('low-side-only metrics ignore high values', () => {
    const m = meta({ low_side_only: true });
    expect(scoreMetric('sleep_h', m, base, rows('sleep_h', [140, 140, 140]), 2, ctx)!.status).toBe('green');
    expect(scoreMetric('sleep_h', m, base, rows('sleep_h', [80, 80, 80]), 2, ctx)!.status).toBe('amber');
    expect(scoreMetric('sleep_h', m, base, rows('sleep_h', [70, 70, 70]), 2, ctx)!.status).toBe('red');
  });

  it('raw value outside absolute_red is red at once, not the mean', () => {
    const m = meta({ absolute_red: { min: 40, max: 110 } });
    const s = scoreMetric('hr', m, base, rows('hr', [100, 100, 111]), 2, ctx)!;
    expect(s.status).toBe('red');
    expect(s.outsideAbsolute).toBe(true);
    // the mean is above the limit but today's raw value is not
    expect(scoreMetric('hr', m, base, rows('hr', [115, 115, 105]), 2, ctx)!.outsideAbsolute).toBe(false);
  });

  it('dose and bone loss use absolute bands only', () => {
    const day = meta({ absolute_red: { min: 0, max: 10 } });
    expect(scoreMetric('dose_mSv_day', day, undefined, rows('dose_mSv_day', [9, 9, 3]), 2, ctx)!.status).toBe('green');
    expect(scoreMetric('dose_mSv_day', day, undefined, rows('dose_mSv_day', [1, 1, 3.1]), 2, ctx)!.status).toBe('amber');
    expect(scoreMetric('dose_mSv_day', day, undefined, rows('dose_mSv_day', [1, 1, 10.1]), 2, ctx)!.status).toBe('red');
    const cum = meta({ absolute_red: { min: 0, max: 600 } });
    expect(scoreMetric('dose_mSv_cum', cum, undefined, rows('dose_mSv_cum', [300]), 0, ctx)!.status).toBe('green');
    expect(scoreMetric('dose_mSv_cum', cum, undefined, rows('dose_mSv_cum', [300.1]), 0, ctx)!.status).toBe('amber');
    expect(scoreMetric('dose_mSv_cum', cum, undefined, rows('dose_mSv_cum', [601]), 0, ctx)!.status).toBe('red');
    const bone = meta({ absolute_red: { min: -100, max: 5 } });
    expect(scoreMetric('bone_loss_pct', bone, undefined, rows('bone_loss_pct', [3]), 0, ctx)!.status).toBe('green');
    expect(scoreMetric('bone_loss_pct', bone, undefined, rows('bone_loss_pct', [3.1]), 0, ctx)!.status).toBe('amber');
    expect(scoreMetric('bone_loss_pct', bone, undefined, rows('bone_loss_pct', [5.1]), 0, ctx)!.status).toBe('red');
    expect(scoreMetric('bone_loss_pct', bone, undefined, rows('bone_loss_pct', [5.1]), 0, ctx)!.z).toBeNull();
  });

  it('a missing value is not a check-in', () => {
    expect(scoreMetric('hr', meta(), base, rows('hr', [100, 100, null]), 2, ctx)).toBeNull();
  });

  it('scoreCheckIn re-entering today\'s stored value gives the stored result', () => {
    const member = data.crew[0];
    const today = member.series[member.series.length - 1];
    for (const metric of Object.keys(data.metrics) as MetricKey[]) {
      const v = today[metric];
      if (v == null) continue;
      const again = scoreCheckIn(member, metric, v, data, data.mission.environment, today.date);
      const stored = scoreMetric(metric, data.metrics[metric], member.baseline[metric], member.series, member.series.length - 1, contextFor(data))!;
      expect(again).toEqual(stored);
    }
  });
});
