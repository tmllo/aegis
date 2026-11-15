// Derivations for the Cockpit Glass body concept. Pure TS, no React.
// Where things sit comes from docs/body-map.json; every value and status comes
// from crew_data.json through core/scoring. Nothing here repeats a number from the files.
import bodyMapJson from '../../../docs/body-map.json';
import lineageJson from '../../../docs/lineage.json';
import {
  AMBER_Z,
  BONE_LOSS_AMBER_PCT,
  DOSE_CUM_AMBER_FRACTION,
  DOSE_DAY_AMBER_FACTOR,
  contextFor,
  dayIndex,
  scoreMetric,
  worst,
  type MetricScore,
} from '../../core/scoring';
import type { CrewData, CrewMember, EnvironmentId, MetricKey, MetricMeta, Region, Status } from '../../data/types';
import { REGIONS } from '../../data/types';

export type Vec3 = [number, number, number];
export type NodeName =
  | 'whole_body'
  | 'brain'
  | 'heart'
  | 'blood'
  | 'bones'
  | 'bones_loadbearing'
  | 'muscle_antigravity';

type PartList = 'all' | string[];

export interface MapMetric {
  region: Region;
  structures: NodeName[];
  parts: Partial<Record<NodeName, PartList>>;
  focus?: Partial<Record<NodeName, string[]>>;
  context?: Partial<Record<NodeName, string[]>>;
  anchor: Vec3;
  label_side: 'screen_left' | 'screen_right';
  view_deg: number;
  localisation: 'target_organ' | 'whole_body' | 'illustrative';
  /** Structures the metric would point at but the GLB does not carry. */
  missing?: string[];
}

export interface MapStructure {
  n: string;
  /** [first triangle, triangle count], null when the range is not verified. */
  t: [number, number] | null;
  b: [Vec3, Vec3];
}

interface BodyMap {
  model: { height_m: number; nodes: Record<NodeName, { contract_region: Region; bbox: [Vec3, Vec3] }> };
  metrics: Record<MetricKey, MapMetric>;
  structure_index: Record<NodeName, MapStructure[]>;
}

export const bodyMap = bodyMapJson as unknown as BodyMap;

/* ------------------------------------------------------------------ words */

export const STATUS_WORD: Record<Status, string> = { green: 'Nominal', amber: 'Watch', red: 'Act' };
export const REGION_WORD: Record<Region, string> = {
  brain: 'Brain',
  heart: 'Heart',
  blood: 'Blood',
  bones: 'Bones',
  whole_body: 'Body',
};
const SHORT: Partial<Record<MetricKey, string>> = {
  hr: 'Heart rate',
  bp_sys: 'Systolic',
  bp_dia: 'Diastolic',
  glucose: 'Glucose',
  temp: 'Temperature',
  sleep_h: 'Sleep',
  mood: 'Mood',
  exercise_min: 'Exercise',
  bone_loss_pct: 'Bone loss',
  dose_mSv_day: 'Dose today',
  dose_mSv_cum: 'Dose total',
};
/** 1-2 word label for tabs and readouts; falls back to the file's own label. */
export const shortLabel = (key: MetricKey, meta: MetricMeta): string => SHORT[key] ?? meta.label;

/** Which metric speaks for a region while everything in it is green (a placement choice, not data). */
const QUIET_LEAD: Record<Region, MetricKey> = {
  brain: 'sleep_h',
  heart: 'hr',
  blood: 'glucose',
  bones: 'exercise_min',
  whole_body: 'dose_mSv_cum',
};

/* ------------------------------------------------------------- crew views */

export interface Band {
  kind: 'baseline' | 'limit';
  /** Scale ends of the strip. */
  lo: number;
  hi: number;
  /** The quiet range: mean +/- 2 sd, or zero up to the amber threshold. */
  from: number;
  to: number;
  mean: number | null;
}

export interface MetricView {
  key: MetricKey;
  meta: MetricMeta;
  map: MapMetric;
  score: MetricScore | null;
  status: Status;
  /** Consecutive days, ending today, on which this metric scored amber or red. */
  days: number;
  direction: 'above' | 'below' | 'inside';
  band: Band;
  /** Last 14 recorded days, oldest first. */
  trace: { date: string; value: number | null }[];
}

export interface RegionView {
  region: Region;
  status: Status;
  lead: MetricKey;
  metrics: MetricView[];
}

export interface CrewView {
  overall: Status;
  regions: Record<Region, RegionView>;
  flagged: MetricView[];
  total: number;
}

const ORDER: Record<Status, number> = { green: 0, amber: 1, red: 2 };

function amberThreshold(key: MetricKey, data: CrewData, env: EnvironmentId): number | null {
  if (key === 'dose_mSv_day') return DOSE_DAY_AMBER_FACTOR * data.environments[env].dose_mSv_day;
  if (key === 'dose_mSv_cum') return DOSE_CUM_AMBER_FRACTION * data.career_limit_mSv;
  if (key === 'bone_loss_pct') return BONE_LOSS_AMBER_PCT;
  return null;
}

function bandFor(key: MetricKey, member: CrewMember, data: CrewData, env: EnvironmentId, value: number | null): Band {
  const meta = data.metrics[key];
  const base = member.baseline[key];
  if (base) {
    const span = Math.max(4 * base.sd, value == null ? 0 : Math.abs(value - base.mean) * 1.15);
    // The quiet range never reads past the metric's own absolute bounds (mood cannot exceed its scale).
    const { min, max } = meta.absolute_red;
    return {
      kind: 'baseline',
      lo: base.mean - span,
      hi: base.mean + span,
      from: Math.max(base.mean - AMBER_Z * base.sd, min),
      to: Math.min(base.mean + AMBER_Z * base.sd, max),
      mean: base.mean,
    };
  }
  const lo = Math.max(0, meta.absolute_red.min);
  const hi = Math.max(meta.absolute_red.max, value ?? 0);
  return { kind: 'limit', lo, hi, from: lo, to: amberThreshold(key, data, env) ?? hi, mean: null };
}

export function buildCrewView(member: CrewMember, data: CrewData, env: EnvironmentId): CrewView {
  const ctx = contextFor(data, env);
  const today = dayIndex(member, data.mission.today);
  const keys = Object.keys(data.metrics) as MetricKey[];

  const views = keys.map((key): MetricView => {
    const meta = data.metrics[key];
    const at = (i: number) => (i < 0 ? null : scoreMetric(key, meta, member.baseline[key], member.series, i, ctx));
    const score = at(today);
    let days = 0;
    for (let i = today; i >= 0; i--) {
      const s = at(i);
      if (!s || s.status === 'green') break;
      days += 1;
    }
    const band = bandFor(key, member, data, env, score?.value ?? null);
    const ref = score ? (score.windowMean ?? score.value) : null;
    const direction = ref == null ? 'inside' : ref > band.to ? 'above' : ref < band.from ? 'below' : 'inside';
    const end = today < 0 ? member.series.length : today + 1;
    const trace = member.series.slice(Math.max(0, end - 14), end).map((r) => ({ date: r.date, value: r[key] }));
    return { key, meta, map: bodyMap.metrics[key], score, status: score?.status ?? 'green', days, direction, band, trace };
  });

  const regions = {} as Record<Region, RegionView>;
  for (const region of REGIONS) {
    const metrics = views.filter((v) => v.meta.body_region === region);
    const status = metrics.reduce<Status>((acc, v) => worst(acc, v.status), 'green');
    const flaggedLead = [...metrics].sort((a, b) => ORDER[b.status] - ORDER[a.status])[0];
    const lead =
      status === 'green'
        ? (metrics.find((v) => v.key === QUIET_LEAD[region]) ?? metrics[0]).key
        : flaggedLead.key;
    regions[region] = { region, status, lead, metrics };
  }
  const overall = REGIONS.reduce<Status>((acc, r) => worst(acc, regions[r].status), 'green');
  const flagged = views.filter((v) => v.status !== 'green').sort((a, b) => ORDER[b.status] - ORDER[a.status]);
  return { overall, regions, flagged, total: views.length };
}

/** Status per GLB node: the worst metric that names the node in body-map structures. null = neutral. */
export function nodeStatuses(view: CrewView): Record<NodeName, Status | null> {
  const out = {} as Record<NodeName, Status | null>;
  for (const name of Object.keys(bodyMap.model.nodes) as NodeName[]) out[name] = null;
  for (const region of REGIONS) {
    for (const m of view.regions[region].metrics) {
      if (m.status === 'green') continue;
      for (const node of m.map.structures) out[node] = worst(out[node] ?? 'green', m.status);
    }
  }
  return out;
}

/**
 * True when the lit anatomy stands in for something else: body-map calls it illustrative,
 * the real target organ is missing from the model, or the first lit structure belongs to
 * a node other than the region's own (exercise lights muscle under Bones).
 */
export function isStandIn(map: MapMetric): boolean {
  if (map.localisation === 'illustrative' || (map.missing?.length ?? 0) > 0) return true;
  const first = map.structures[0];
  return map.localisation !== 'whole_body' && first !== map.region && first !== 'bones_loadbearing';
}

/** Low, mean and high of the recorded days in a trace. */
export function traceStats(trace: MetricView['trace']): { min: number; mean: number; max: number } | null {
  const vals = trace.map((t) => t.value).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return { min: Math.min(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length, max: Math.max(...vals) };
}

/* ------------------------------------------------------------------ boxes */

export interface Box {
  min: Vec3;
  max: Vec3;
}

const union = (boxes: [Vec3, Vec3][]): Box | null => {
  if (!boxes.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [a, b] of boxes) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], a[k]);
      max[k] = Math.max(max[k], b[k]);
    }
  }
  return { min, max };
};

const structuresOf = (node: NodeName, names: string[]): MapStructure[] => {
  const set = new Set(names);
  return bodyMap.structure_index[node].filter((s) => set.has(s.n));
};

/** The box the camera fits and the brackets frame: the metric's focus parts, else its nodes. */
export function focusBox(key: MetricKey): Box {
  const m = bodyMap.metrics[key];
  const focus = Object.entries(m.focus ?? {}) as [NodeName, string[]][];
  const fromFocus = union(focus.flatMap(([node, names]) => structuresOf(node, names).map((s) => s.b)));
  if (fromFocus) return fromFocus;
  return union(m.structures.map((n) => bodyMap.model.nodes[n].bbox)) as Box;
}

/* ---------------------------------------------------------------- lineage */

interface LineageNode {
  id: string;
  label: string;
  status: string;
  layer: number;
  fields?: string[];
}
const lineage = lineageJson as unknown as { nodes: LineageNode[]; edges: { from: string; to: string }[] };

/** Shortest path in lineage.json from the first node that produces this metric to the Crew Console. */
export function sourceChain(key: MetricKey): LineageNode[] {
  const byId = new Map(lineage.nodes.map((n) => [n.id, n]));
  const start = lineage.nodes.find((n) => n.fields?.includes(key) && n.status === 'simulated');
  const goal = lineage.nodes.find((n) => n.id === 'sf_console');
  if (!start || !goal) return [];
  const prev = new Map<string, string | null>([[start.id, null]]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift() as string;
    if (id === goal.id) break;
    for (const e of lineage.edges) {
      if (e.from === id && !prev.has(e.to)) {
        prev.set(e.to, id);
        queue.push(e.to);
      }
    }
  }
  if (!prev.has(goal.id)) return [];
  const path: LineageNode[] = [];
  for (let id: string | null = goal.id; id; id = prev.get(id) ?? null) path.unshift(byId.get(id) as LineageNode);
  return path;
}

/* ----------------------------------------------------------------- format */

export const fmt = (v: number): string => {
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100);
};

/** "Cmdr. Ana Silva" -> "AS": titles (tokens ending in a full stop) are left out. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((t) => !t.endsWith('.'))
    .map((t) => t[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
