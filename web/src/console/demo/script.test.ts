import { describe, expect, it } from 'vitest';
import { crewData, stormForecast } from '../../core/testdata';
import { buildBeats, strongestLink } from './script';

const cd = crewData();
const storm = stormForecast();
const seat: Record<string, string> = Object.fromEntries(cd.crew.map((c) => [c.id, c.role.includes('Commander') ? 'CDR' : c.role.includes('Engineer') ? 'FE' : 'MS1']));
const beats = buildBeats(cd, storm, seat);

describe('guided demo script', () => {
  it('has six beats that run 60 to 90 seconds in total', () => {
    expect(beats.map((b) => b.id)).toEqual(['today', 'link', 'action', 'setting', 'storm', 'dose']);
    const total = beats.reduce((s, b) => s + b.seconds, 0);
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(90);
  });

  it('writes every sentence from the data, with no holes', () => {
    for (const b of beats) {
      expect(b.caption).not.toMatch(/undefined|NaN|null|--/);
      expect(b.caption.length).toBeLessThan(200);
      expect(b.title.split(' ').length).toBeLessThanOrEqual(4);
    }
  });

  it('uses the numbers that are in the files', () => {
    const fe = cd.crew.find((c) => seat[c.id] === 'FE')!;
    const sleep = fe.series.find((r) => r.date === cd.mission.today)!.sleep_h!;
    expect(beats[0].caption).toContain(`sleep ${sleep.toFixed(1)} h`);
    expect(beats[3].caption).toContain(String(cd.environments[cd.mission.environment].dose_mSv_day));
    expect(beats[3].caption).toContain(String(cd.environments.transit.dose_mSv_day));
    expect(beats[5].caption).toContain(`${cd.career_limit_mSv} mSv`);
    const firstWarning = storm.events.filter((e) => e.split === 'test' && e.alert_level === 'warning' && e.actual_storm && e.peak_time.startsWith('2024-05')).sort((a, b) => a.peak_time.localeCompare(b.peak_time))[0];
    expect(beats[4].caption).toContain(`${Math.floor(firstWarning.lead_time_h!)} hours`);
    expect(beats[4].to).toContain('mode=replay&at=2024-05-08T');
  });

  it('finds what moved with the flagged metric and gives two trend lines', () => {
    const fe = cd.crew.find((c) => seat[c.id] === 'FE')!;
    const link = strongestLink(fe, cd.mission.today, 'sleep_h');
    expect(link).not.toBeNull();
    expect(beats[1].trends).toHaveLength(2);
    expect(beats[1].trends![0].values.length).toBe(14);
  });
});
