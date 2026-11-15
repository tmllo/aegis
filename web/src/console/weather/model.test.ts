import { describe, expect, it } from 'vitest';
import { crewData, stormForecast } from '../../core/testdata';
import { replayEvents, sortedEvents } from '../../core/radiation';
import { connection, footpointDeg, forecastFor, frontHours, spiralDeg, stormExtraDose } from './model';

const cd = crewData();
const storm = stormForecast();

describe('space-weather forecast model', () => {
  it('puts the Earth field-line footpoint near 60 deg west (Parker spiral, 400 km/s wind)', () => {
    expect(footpointDeg(1)).toBeGreaterThan(55);
    expect(footpointDeg(1)).toBeLessThan(65);
    expect(footpointDeg(1.52)).toBeGreaterThan(footpointDeg(1));
    expect(spiralDeg(1, 1)).toBeCloseTo(0, 9); // the line ends at the crew
    expect(spiralDeg(0, 1)).toBeCloseTo(footpointDeg(1), 9);
  });

  it('rates the path: west-limb flares are direct, east-limb flares are off to the side', () => {
    expect(connection(60, 'moon')!.path).toBe('direct');
    expect(connection(0, 'moon')!.path).toBe('partial');
    expect(connection(-60, 'moon')!.path).toBe('side');
    expect(connection(null, 'moon')).toBeNull();
  });

  it('gives a plausible travel time for an eruption', () => {
    expect(frontHours(1500, 'moon')).toBeGreaterThan(26);
    expect(frontHours(1500, 'moon')).toBeLessThan(29);
    expect(frontHours(1500, 'mars')).toBeGreaterThan(frontHours(1500, 'moon'));
  });

  it('reads the latest flare and the first May 2024 warning from the file', () => {
    const latest = sortedEvents(storm).at(-1)!;
    const now = forecastFor(latest, storm, cd.mission.environment);
    expect(now.chancePct).toBe(Math.round(latest.p_storm * 100));
    expect(now.typicalWarningH).toBe(storm.meta.metrics_test.median_lead_time_h);
    const hit = replayEvents(storm).find((e) => e.alert_level === 'warning' && e.actual_storm)!;
    const may = forecastFor(hit, storm, 'moon');
    expect(may.level).toBe('warning');
    expect(may.front?.kms).toBe(hit.cme_speed_kms);
  });

  it('takes the extra storm dose from the crew series', () => {
    const d = stormExtraDose(cd.crew[1], cd, cd.mission.environment)!;
    expect(d.extra).toBeGreaterThan(1);
    expect(cd.crew[1].series.some((r) => r.date === d.date)).toBe(true);
  });
});
