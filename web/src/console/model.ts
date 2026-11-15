// Numbers for the Dragon frame. Everything comes from src/data (files) and src/core (rules).
import { dayIndex, statusOn, type MetricScore } from '../core/scoring';
import type { CrewData, CrewMember, MetricKey, Status } from '../data/types';
import type { TargetId } from '../components/body3d/targets';

export const STATUS_WORD: Record<Status, string> = { green: 'Normal', amber: 'Watch', red: 'Act now' };
export const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };

/** UI names, 1-2 words. */
export const SHORT: Record<MetricKey, string> = {
  hr: 'Pulse',
  bp_sys: 'Pressure',
  bp_dia: 'Diastolic',
  glucose: 'Glucose',
  temp: 'Temp',
  sleep_h: 'Sleep',
  mood: 'Mood',
  exercise_min: 'Exercise',
  bone_loss_pct: 'Bone loss',
  dose_mSv_day: 'Dose',
  dose_mSv_cum: 'Total dose',
};

/** Level 1: four vitals round the body, and the organ each one opens. */
export const GAUGES: { k: MetricKey; t: TargetId }[] = [
  { k: 'hr', t: 'heart' },
  { k: 'bp_sys', t: 'vessels' },
  { k: 'sleep_h', t: 'brain' },
  { k: 'temp', t: 'dna' },
];

/** Level 2: the readings each organ shows. */
export const TARGET_METRICS: Record<TargetId, MetricKey[]> = {
  heart: ['hr', 'bp_sys'],
  vessels: ['bp_sys', 'bp_dia'],
  brain: ['sleep_h', 'mood'],
  bone: ['bone_loss_pct', 'exercise_min'],
  muscle: ['exercise_min'],
  metabolic: ['glucose'],
  dna: ['dose_mSv_day', 'temp'],
};

/** Metric -> organ, for the most important issue. */
export const METRIC_TARGET: Partial<Record<MetricKey, TargetId>> = {
  hr: 'heart',
  bp_sys: 'vessels',
  bp_dia: 'vessels',
  glucose: 'metabolic',
  temp: 'dna',
  sleep_h: 'brain',
  mood: 'brain',
  exercise_min: 'muscle',
  bone_loss_pct: 'bone',
  dose_mSv_day: 'dna',
  dose_mSv_cum: 'dna',
};

export interface Row {
  k: MetricKey;
  label: string;
  unit: string;
  value: number | null;
  digits: number;
  status: Status;
  z: number | null;
  mean: number | null;
  lo: number | null;
  hi: number | null;
  history: (number | null)[];
  /** Dates of history, and which of them carry a flag on this metric. */
  dates: string[];
  flagged: boolean[];
  /** Consecutive days up to today with a flag on this metric. */
  running: number;
  action: string;
}

const digitsOf = (k: MetricKey, v: number | null) => (k === 'temp' || k === 'sleep_h' || k === 'bone_loss_pct' ? 1 : k.startsWith('dose') ? 2 : v != null && !Number.isInteger(v) ? 1 : 0);

export function fmt(v: number | null, d: number): string {
  return v == null ? 'No data' : v.toFixed(d);
}

export function rowOf(cd: CrewData, m: CrewMember, scores: MetricScore[], k: MetricKey): Row {
  const i = dayIndex(m, cd.mission.today);
  const value = i >= 0 ? m.series[i][k] : null;
  const b = m.baseline[k];
  const s = scores.find((x) => x.metric === k);
  const status = s?.status ?? 'green';
  const flagDays = new Set(m.flags.filter((f) => f.metric === k).map((f) => f.date));
  let running = 0;
  for (let j = i; j >= 0 && flagDays.has(m.series[j].date); j--) running++;
  const flag = m.flags.find((f) => f.metric === k && f.date === cd.mission.today);
  const meta = cd.metrics[k];
  return {
    k,
    label: SHORT[k],
    unit: meta.unit,
    value,
    digits: digitsOf(k, value),
    status,
    z: s?.z ?? null,
    mean: b?.mean ?? null,
    lo: b ? b.mean - 2 * b.sd : null,
    hi: b ? b.mean + 2 * b.sd : null,
    history: i >= 0 ? m.series.slice(Math.max(0, i - 20), i + 1).map((r) => r[k]) : [],
    dates: i >= 0 ? m.series.slice(Math.max(0, i - 20), i + 1).map((r) => r.date) : [],
    flagged: i >= 0 ? m.series.slice(Math.max(0, i - 20), i + 1).map((r) => flagDays.has(r.date)) : [],
    running,
    action: status === 'green' ? meta.how_to_measure : flag?.action ?? meta.actions[status],
  };
}

export interface CrewView {
  m: CrewMember;
  overall: Status;
  scores: MetricScore[];
  /** The single most important issue (worst status, then largest score), or null. */
  issue: MetricScore | null;
}

/** Today's self-reported mood (Mind screen) replaces the series value, so it feeds the brain region. */
export function withMood(cd: CrewData, m: CrewMember, mood: number | undefined): CrewMember {
  if (mood == null) return m;
  return { ...m, series: m.series.map((r) => (r.date === cd.mission.today ? { ...r, mood } : r)) };
}

export function crewView(cd: CrewData, m: CrewMember): CrewView {
  const { status, scores } = statusOn(m, cd);
  const issue =
    [...scores]
      .filter((s) => s.status !== 'green')
      .sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))[0] ?? null;
  return { m, overall: status.overall, scores, issue };
}

export const shortName = (name: string) => name.replace(/^\S+\.\s/, '');
