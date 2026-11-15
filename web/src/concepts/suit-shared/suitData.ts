// Shared data for the suit concepts (suit-a, suit-b, suit-c). No index.tsx here,
// so the registry does not list this folder as a concept.
// Every number comes from public/data, public/samples (via src/data) or src/core.
import { useMemo } from 'react';
import { useMissionData } from '../../data/store';
import { useCabin } from '../../data/cabin';
import { dayIndex, statusOn, worst, type MetricScore } from '../../core/scoring';
import type { CabinReading } from '../../core/cabin';
import type { CrewData, CrewMember, MetricKey, Status } from '../../data/types';

export type SensorId = 'head' | 'heart' | 'lungs' | 'wrist';
export const SENSORS: SensorId[] = ['head', 'heart', 'lungs', 'wrist'];

/** GLB node per sensor (blender-assets/06-suit-design/web/ana-suit.glb). */
export const SENSOR_NODE: Record<SensorId, string> = {
  head: 'sensor_head',
  heart: 'sensor_heart',
  lungs: 'sensor_lungs',
  wrist: 'sensor_wrist',
};

/** UI names, 1-3 words. */
export const SENSOR_NAME: Record<SensorId, string> = { head: 'Head', heart: 'Heart', lungs: 'Breathing', wrist: 'Wrist' };
export const SENSOR_READS: Record<SensorId, string> = {
  head: 'Sleep, mood',
  heart: 'Pulse, pressure',
  lungs: 'Cabin air',
  wrist: 'Pulse, temp, activity',
};

const SENSOR_METRICS: Record<Exclude<SensorId, 'lungs'>, MetricKey[]> = {
  head: ['sleep_h', 'mood'],
  heart: ['bp_sys', 'bp_dia', 'hr'],
  wrist: ['hr', 'temp', 'exercise_min'],
};
/** No breathing or SpO2 in crew_data.json: the breathing band shows the air she breathes. */
const LUNG_KEYS = ['cabin.ppco2', 'cabin.ppo2'];

const SHORT: Partial<Record<MetricKey, string>> = {
  hr: 'Pulse',
  bp_sys: 'Systolic',
  bp_dia: 'Diastolic',
  temp: 'Temperature',
  sleep_h: 'Sleep',
  mood: 'Mood',
  exercise_min: 'Activity',
};

export const STATUS_WORD: Record<Status, string> = { green: 'Normal', amber: 'Watch', red: 'Act now' };

export interface Reading {
  key: string;
  short: string;
  label: string;
  unit: string;
  value: number | null;
  digits: number;
  status: Status | null;
  /** Personal baseline (crew metric) or null (cabin). */
  mean: number | null;
  /** 3-day-mean z from core/scoring. */
  z: number | null;
  /** Normal band: mean +/- 2 sd (crew) or the amber band (cabin). */
  lo: number | null;
  hi: number | null;
  /** 'baseline' = her own band; 'limit' = cabin limit (NASA or Team). */
  basis: 'baseline' | 'limit';
  limitSource?: string;
  /** Last 14 recorded days up to today (crew metrics only). */
  history: (number | null)[];
}

export interface SensorState {
  id: SensorId;
  /** null = no feed. */
  status: Status | null;
  readings: Reading[];
  primary: Reading | null;
  action: { label: string; detail: string };
}

export interface SuitData {
  data: CrewData;
  crew: CrewMember;
  today: string;
  day: number;
  overall: Status;
  sensors: Record<SensorId, SensorState>;
  scores: MetricScore[];
  flagsToday: number;
  cabin: { signal: boolean; origin: 'server' | 'sample' } | null;
  stormCredit: string | null;
  stormModel: string | null;
}

const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
const digitsOf = (v: number | null) => (v == null || Number.isInteger(v) ? 0 : 1);

export function fmt(v: number | null, digits: number): string {
  return v == null ? 'No feed' : v.toFixed(digits);
}

function crewReading(crew: CrewMember, data: CrewData, key: MetricKey, scores: MetricScore[], i: number): Reading {
  const meta = data.metrics[key];
  const s = scores.find((x) => x.metric === key);
  const b = crew.baseline[key];
  const value = i >= 0 ? crew.series[i][key] : null;
  const history = i >= 0 ? crew.series.slice(Math.max(0, i - 13), i + 1).map((r) => r[key]) : [];
  return {
    key,
    short: SHORT[key] ?? meta.label,
    label: meta.label,
    unit: meta.unit,
    value,
    digits: key === 'temp' || key === 'sleep_h' ? 1 : digitsOf(value),
    status: s?.status ?? null,
    mean: b?.mean ?? null,
    z: s?.z ?? null,
    lo: b ? b.mean - 2 * b.sd : null,
    hi: b ? b.mean + 2 * b.sd : null,
    basis: 'baseline',
    history,
  };
}

function cabinReading(r: CabinReading): Reading {
  const b = r.metric.bands;
  return {
    key: r.metric.key,
    short: r.metric.short,
    label: r.metric.label,
    unit: r.metric.unit,
    value: r.value,
    digits: r.metric.digits,
    status: r.status,
    mean: null,
    z: null,
    lo: b.amber_low ?? b.red_low ?? null,
    hi: b.amber_high ?? b.red_high ?? null,
    basis: 'limit',
    limitSource: r.metric.source,
    history: [],
  };
}

function pickPrimary(rs: Reading[]): Reading | null {
  return (
    [...rs].sort(
      (a, b) =>
        (b.status ? RANK[b.status] : -1) - (a.status ? RANK[a.status] : -1) ||
        Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0),
    )[0] ?? null
  );
}

function worstOf(rs: Reading[]): Status | null {
  const st = rs.map((r) => r.status).filter((s): s is Status => s != null);
  return st.length ? st.reduce(worst, 'green' as Status) : null;
}

/** Ana = crew c1 (falls back to the first crew member). */
export function useSuitData(crewId = 'c1'): SuitData | null {
  const { data } = useMissionData();
  const { cabin } = useCabin();
  return useMemo(() => {
    if (!data) return null;
    const cd = data.crew;
    const crew = cd.crew.find((c) => c.id === crewId) ?? cd.crew[0];
    if (!crew) return null;
    const today = cd.mission.today;
    const i = dayIndex(crew, today);
    const { status, scores } = statusOn(crew, cd, today);
    const todayFlags = crew.flags.filter((f) => f.date === today);

    const sensors = {} as Record<SensorId, SensorState>;
    for (const id of SENSORS) {
      let readings: Reading[];
      if (id === 'lungs') {
        readings = LUNG_KEYS.map((k) => cabin?.readings.find((r) => r.metric.key === k))
          .filter((r): r is CabinReading => !!r)
          .map(cabinReading);
      } else {
        readings = SENSOR_METRICS[id].map((k) => crewReading(crew, cd, k, scores, i));
      }
      const st = worstOf(readings);
      const primary = pickPrimary(readings);
      let action: SensorState['action'];
      if (id === 'lungs') {
        action =
          st && st !== 'green'
            ? { label: 'Tell ground', detail: cabin?.readings.find((r) => r.metric.key === primary?.key)?.metric.ref ?? '' }
            : { label: 'Air log', detail: primary?.limitSource ? `Limit source: ${primary.limitSource}` : '' };
      } else {
        const key = primary?.key as MetricKey | undefined;
        const flag = todayFlags.find((f) => f.metric === key);
        if (key && primary?.status && primary.status !== 'green') {
          action = { label: 'Re-measure', detail: flag?.action ?? cd.metrics[key].actions[primary.status] };
        } else {
          action = { label: 'Log check', detail: key ? cd.metrics[key].how_to_measure : '' };
        }
      }
      sensors[id] = { id, status: st, readings, primary, action };
    }

    const overall = SENSORS.reduce<Status>((w, id) => worst(w, sensors[id].status ?? 'green'), status.overall);
    return {
      data: cd,
      crew,
      today,
      day: i + 1,
      overall,
      sensors,
      scores,
      flagsToday: todayFlags.length,
      cabin: cabin ? { signal: cabin.signal, origin: cabin.origin } : null,
      stormCredit: data.storm.meta.data_credit,
      stormModel: data.storm.meta.model,
    };
  }, [data, cabin, crewId]);
}

/** Position of a value on a scale that holds the band and the value, 0..1. */
export function bandScale(r: Reading): { v: number; lo: number; hi: number; mean: number | null } | null {
  if (r.value == null || (r.lo == null && r.hi == null)) return null;
  const lo = r.lo ?? r.value;
  const hi = r.hi ?? r.value;
  const span = Math.max(hi - lo, Math.abs(r.value) * 0.05, 1e-6);
  const min = Math.min(lo, r.value) - span * 0.5;
  const max = Math.max(hi, r.value) + span * 0.5;
  const p = (x: number) => (x - min) / (max - min);
  return { v: p(r.value), lo: p(lo), hi: p(hi), mean: r.mean == null ? null : p(r.mean) };
}
