// Radiation: forecast feed, alert levels, dose against the career limit and
// the May 2024 replay timeline. Pure functions, no React.
//
// Rules (BUILD-KICKOFF section 4):
//   - feed = storm_forecast.events sorted by peak_time
//   - headline numbers come from meta.metrics_test only, never recomputed
//   - replay uses split === 'test' events inside REPLAY_WINDOW only
//   - lead time in the replay = first warning flare's peak_time to that
//     storm's storm_onset_time, labelled "from flare peak"
//   - say "particles arrive", never "storm hits"

import type { AlertLevel, CrewData, CrewMember, EnvironmentId, FlareEvent, StormForecast } from '../data/types';

/** Mission rule shown full-screen when a warning fires. */
export const SHELTER_BANNER = 'SEP LIKELY: SUSPEND EVA, CREW TO SHELTER (mission rule)';
export const LEAD_LABEL = 'from flare peak';
/** The replay window: dates in the held-out test period (the May 2024 storms). */
export const REPLAY_WINDOW = { from: '2024-05-05T00:00:00Z', to: '2024-05-21T00:00:00Z' } as const;

export type Outcome = 'hit' | 'miss' | 'false_alarm' | 'quiet';

/** WORKING. Events sorted by peak_time, oldest first. Does not mutate the input. */
export function sortedEvents(storm: Pick<StormForecast, 'events'>): FlareEvent[] {
  return [...storm.events].sort((a, b) => Date.parse(a.peak_time) - Date.parse(b.peak_time));
}

/** WORKING. Test-split events inside the window, oldest first. */
export function replayEvents(
  storm: Pick<StormForecast, 'events'>,
  window: { from: string; to: string } = REPLAY_WINDOW,
): FlareEvent[] {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  return sortedEvents(storm).filter((e) => {
    const t = Date.parse(e.peak_time);
    return e.split === 'test' && t >= from && t < to;
  });
}

/**
 * WORKING. How one flare's alert compares with what happened.
 * warning + storm = hit; warning + no storm = false alarm;
 * storm without a warning = miss; anything else is quiet.
 */
export function outcomeOf(e: Pick<FlareEvent, 'alert_level' | 'actual_storm'>): Outcome {
  if (e.alert_level === 'warning') return e.actual_storm ? 'hit' : 'false_alarm';
  return e.actual_storm ? 'miss' : 'quiet';
}

/** WORKING. Alert level of a probability under the file's thresholds. */
export function levelOf(p: number, thresholds: StormForecast['meta']['thresholds']): AlertLevel {
  if (p >= thresholds.warning) return 'warning';
  if (p >= thresholds.watch) return 'watch';
  return 'none';
}

export interface DoseSummary {
  /** Latest cumulative dose in the series, mSv. null when never measured. */
  cumulative_mSv: number | null;
  /** Latest daily dose, mSv. */
  daily_mSv: number | null;
  careerLimit_mSv: number;
  /** cumulative / career limit, 0-1. */
  fraction: number | null;
  /** Normal daily dose of the environment, from the file. */
  environmentDaily_mSv: number;
  /** Days until the career limit at the environment's normal daily dose. */
  daysToLimit: number | null;
}

/** WORKING. Dose against the career limit for one crew member. */
export function doseSummary(member: Pick<CrewMember, 'series'>, data: CrewData, environment: EnvironmentId): DoseSummary {
  const latest = (key: 'dose_mSv_cum' | 'dose_mSv_day'): number | null => {
    for (let i = member.series.length - 1; i >= 0; i--) {
      const v = member.series[i][key];
      if (v != null) return v;
    }
    return null;
  };
  const cumulative = latest('dose_mSv_cum');
  const envDaily = data.environments[environment].dose_mSv_day;
  return {
    cumulative_mSv: cumulative,
    daily_mSv: latest('dose_mSv_day'),
    careerLimit_mSv: data.career_limit_mSv,
    fraction: cumulative === null ? null : cumulative / data.career_limit_mSv,
    environmentDaily_mSv: envDaily,
    daysToLimit: cumulative === null || envDaily <= 0 ? null : Math.max(0, (data.career_limit_mSv - cumulative) / envDaily),
  };
}
