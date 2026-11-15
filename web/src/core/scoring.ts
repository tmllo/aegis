// Personal-baseline scoring: the client-side rule from contracts/DATA_CONTRACT.md,
// mirroring ml/crew_flags.py line for line. Pure functions, no React.
//
//   w = mean of the non-null values on day t, t-1 and t-2 (a missing day is left out)
//   z = (w - baseline.mean) / baseline.sd          (stored sd already includes the floor)
//   score = -z for low-side-only metrics, |z| otherwise
//   amber at score >= 2, red at score >= 3, red at once if the RAW value is outside absolute_red
//   dose and bone loss: absolute bands only, never averaged

import type {
  CrewData,
  CrewMember,
  EnvironmentId,
  MetricKey,
  MetricMeta,
  Baseline,
  Region,
  RegionStatus,
  Severity,
  SeriesRow,
  Status,
} from '../data/types';

export const ROLLING_DAYS = 3;
export const AMBER_Z = 2;
export const RED_Z = 3;
/** Daily dose is amber above this multiple of the environment's normal daily dose. */
export const DOSE_DAY_AMBER_FACTOR = 3;
/** Cumulative dose is amber above this fraction of the career limit. */
export const DOSE_CUM_AMBER_FRACTION = 0.5;
/** Estimated bone loss is amber above this many percent. */
export const BONE_LOSS_AMBER_PCT = 3;

const ORDER: Record<Status, number> = { green: 0, amber: 1, red: 2 };
const REGION_LIST: Region[] = ['brain', 'heart', 'blood', 'bones', 'whole_body'];

export interface ScoreContext {
  /** Normal daily dose of the current environment (environments[env].dose_mSv_day). */
  envDosePerDay: number;
  careerLimit_mSv: number;
}

export interface MetricScore {
  metric: MetricKey;
  /** The raw check-in value. */
  value: number;
  /** 3-day mean used for z; null for metrics on absolute bands. */
  windowMean: number | null;
  /** 3-day-mean z; null when the metric has no personal baseline. */
  z: number | null;
  /** -z for low-side-only metrics, |z| otherwise; null when z is null. */
  score: number | null;
  /** Raw value outside absolute_red. */
  outsideAbsolute: boolean;
  status: Status;
}

export const worst = (a: Status, b: Status): Status => (ORDER[b] > ORDER[a] ? b : a);

export function outside(value: number | null | undefined, limits: { min: number; max: number }): boolean {
  return value != null && (value < limits.min || value > limits.max);
}

/**
 * Mean of this day's value and the previous days in the window.
 * A missing day is left out. A missing value today is not a check-in (returns null).
 */
export function windowMean(
  series: readonly SeriesRow[],
  i: number,
  metric: MetricKey,
  window = ROLLING_DAYS,
): number | null {
  if (series[i]?.[metric] == null) return null;
  let sum = 0;
  let n = 0;
  for (let j = Math.max(0, i - window + 1); j <= i; j++) {
    const v = series[j][metric];
    if (v != null) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/**
 * Scores the check-in at series[i] for one metric.
 * Returns null when there is no value that day (no check-in).
 */
export function scoreMetric(
  metric: MetricKey,
  meta: MetricMeta,
  baseline: Baseline | undefined,
  series: readonly SeriesRow[],
  i: number,
  ctx: ScoreContext,
): MetricScore | null {
  const value = series[i]?.[metric];
  if (value == null) return null;

  let severity: Severity | null = null;
  let w: number | null = null;
  let z: number | null = null;
  let score: number | null = null;

  if (baseline) {
    w = windowMean(series, i, metric);
    if (w !== null) {
      z = (w - baseline.mean) / baseline.sd;
      score = meta.low_side_only ? -z : Math.abs(z);
      if (score >= RED_Z) severity = 'red';
      else if (score >= AMBER_Z) severity = 'amber';
    }
  }

  const outsideAbsolute = outside(value, meta.absolute_red);
  if (outsideAbsolute) severity = 'red';

  if (metric === 'dose_mSv_day' && value > DOSE_DAY_AMBER_FACTOR * ctx.envDosePerDay) {
    severity = value > meta.absolute_red.max ? 'red' : 'amber';
  }
  if (metric === 'dose_mSv_cum' && value > DOSE_CUM_AMBER_FRACTION * ctx.careerLimit_mSv) {
    severity = severity ?? 'amber';
  }
  if (metric === 'bone_loss_pct' && value > BONE_LOSS_AMBER_PCT) {
    severity = severity ?? 'amber';
  }

  return { metric, value, windowMean: w, z, score, outsideAbsolute, status: severity ?? 'green' };
}

/** Scores every metric that has a value on series[i]. */
export function scoreDay(
  member: Pick<CrewMember, 'baseline' | 'series'>,
  metrics: CrewData['metrics'],
  i: number,
  ctx: ScoreContext,
): MetricScore[] {
  const out: MetricScore[] = [];
  for (const metric of Object.keys(metrics) as MetricKey[]) {
    const s = scoreMetric(metric, metrics[metric], member.baseline[metric], member.series, i, ctx);
    if (s) out.push(s);
  }
  return out;
}

/** Worst status per body region, plus overall (worst of all). */
export function regionStatus(scores: readonly MetricScore[], metrics: CrewData['metrics']): RegionStatus {
  const out = { brain: 'green', heart: 'green', blood: 'green', bones: 'green', whole_body: 'green', overall: 'green' } as RegionStatus;
  for (const s of scores) {
    const region = metrics[s.metric].body_region;
    out[region] = worst(out[region], s.status);
  }
  out.overall = REGION_LIST.reduce<Status>((acc, r) => worst(acc, out[r]), 'green');
  return out;
}

export function contextFor(data: CrewData, environment: EnvironmentId = data.mission.environment): ScoreContext {
  return {
    envDosePerDay: data.environments[environment].dose_mSv_day,
    careerLimit_mSv: data.career_limit_mSv,
  };
}

/** Index of the row dated `date` (default: mission.today), or -1. */
export function dayIndex(member: Pick<CrewMember, 'series'>, date: string): number {
  return member.series.findIndex((r) => r.date === date);
}

/**
 * Status of one crew member on a given day (default: mission.today), computed
 * from the series with the contract rule. All green when there is no row that day.
 */
export function statusOn(
  member: Pick<CrewMember, 'baseline' | 'series'>,
  data: CrewData,
  date: string = data.mission.today,
  environment: EnvironmentId = data.mission.environment,
): { status: RegionStatus; scores: MetricScore[] } {
  const i = dayIndex(member, date);
  const scores = i < 0 ? [] : scoreDay(member, data.metrics, i, contextFor(data, environment));
  return { status: regionStatus(scores, data.metrics), scores };
}

/**
 * Scores a new check-in value against the existing series: the value is treated
 * as day t and averaged with the last two recorded days.
 */
export function scoreCheckIn(
  member: Pick<CrewMember, 'baseline' | 'series'>,
  metric: MetricKey,
  value: number,
  data: CrewData,
  environment: EnvironmentId = data.mission.environment,
  date: string = data.mission.today,
): MetricScore {
  // Replace the row for `date` if it exists, otherwise append a new day.
  const existing = dayIndex(member, date);
  const series = existing >= 0 ? member.series.slice(0, existing + 1) : member.series.slice();
  const blank = Object.fromEntries(Object.keys(data.metrics).map((k) => [k, null])) as Omit<SeriesRow, 'date'>;
  const row = { ...(existing >= 0 ? series[existing] : { date, ...blank }), [metric]: value } as SeriesRow;
  if (existing >= 0) series[existing] = row;
  else series.push(row);
  const s = scoreMetric(metric, data.metrics[metric], member.baseline[metric], series, series.length - 1, contextFor(data, environment));
  return s as MetricScore; // value is non-null, so a score always exists
}
