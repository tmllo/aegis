// Daylight Clinic, body surface: where things are (docs/body-map.json) and
// small derivations on top of core scoring. Nothing here holds a health value.
import raw from '../../../docs/body-map.json';
import { scoreMetric, type ScoreContext } from '../../core/scoring';
import type { CrewData, CrewMember, MetricKey, Region, Status } from '../../data/types';

export type Vec3 = [number, number, number];
export type Box = [Vec3, Vec3];

interface BMStructure {
  n: string;
  t: [number, number] | null;
  c: Vec3;
  b: Box;
}
interface BMMetric {
  region: Region;
  structures: string[];
  parts: Record<string, 'all' | string[]>;
  focus?: Record<string, string[]>;
  anchor: Vec3;
  localisation: string;
}
interface BodyMap {
  model: { height_m: number; nodes: Record<string, { bbox: Box }> };
  contract_regions: Record<Region, { nodes: string[]; metrics: MetricKey[] }>;
  metrics: Record<MetricKey, BMMetric>;
  structure_index: Record<string, BMStructure[]>;
}

export const BM = raw as unknown as BodyMap;
export const BODY_H = BM.model.height_m;
export const NODE_NAMES = Object.keys(BM.model.nodes);

/** Camera framing shared by the 3D rig and the 2D height ruler. */
export const FOV = 30;
export const HOME_FRAC = 0.85; // body height as a fraction of the stage height
export const HOME_TY = 0.477; // camera target height as a fraction of body height
export const HOME_VISIBLE = BODY_H / HOME_FRAC;

/** Stage y (px) of a body height (m) in the home view. Exact for points on the body axis. */
export const homeY = (m: number, stageH: number): number =>
  stageH / 2 - ((m - BODY_H * HOME_TY) / HOME_VISIBLE) * stageH;

/** Half the body's width (arm span) as a fraction of the stage height, in the home view. */
export const BODY_HALF_FRAC = (BM.model.nodes.whole_body.bbox[1][0] / BODY_H) * HOME_FRAC;

export const ORDER: Record<Status, number> = { green: 0, amber: 1, red: 2 };

export const REGION_NAME: Record<Region, string> = {
  brain: 'Brain',
  heart: 'Heart',
  blood: 'Blood',
  bones: 'Bones',
  whole_body: 'Whole body',
};

/** One-word names for rows and labels (copy, not data). */
export const SHORT: Record<MetricKey, string> = {
  hr: 'Pulse',
  bp_sys: 'Systolic',
  bp_dia: 'Diastolic',
  glucose: 'Glucose',
  temp: 'Temperature',
  sleep_h: 'Sleep',
  mood: 'Mood',
  exercise_min: 'Exercise',
  bone_loss_pct: 'Bone',
  dose_mSv_day: 'Dose',
  dose_mSv_cum: 'Total dose',
};

export const STATUS_WORD: Record<Status, string> = { green: 'Clear', amber: 'Watch', red: 'Act' };
export const DETAIL_WORD: Record<Status, string> = { green: 'In range', amber: 'Watch', red: 'Act now' };

/** Instrument readings that can be taken again on the spot (interaction rule, not data). */
const REMEASURABLE: ReadonlySet<MetricKey> = new Set<MetricKey>(['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp']);
export const canRemeasure = (metric: MetricKey): boolean => REMEASURABLE.has(metric);

export function unionBox(boxes: Box[]): Box {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [a, b] of boxes) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], a[k]);
      hi[k] = Math.max(hi[k], b[k]);
    }
  }
  return [lo, hi];
}

function focusStructures(metric: MetricKey): { node: string; s: BMStructure }[] {
  const out: { node: string; s: BMStructure }[] = [];
  for (const [node, names] of Object.entries(BM.metrics[metric].focus ?? {})) {
    const want = new Set(names);
    for (const s of BM.structure_index[node] ?? []) if (want.has(s.n)) out.push({ node, s });
  }
  return out;
}

/** Box that frames a metric: its focus structures, or the whole node when it has none. */
export function metricBox(metric: MetricKey): Box {
  const f = focusStructures(metric);
  if (f.length) return unionBox(f.map((x) => x.s.b));
  return unionBox(BM.metrics[metric].structures.map((n) => BM.model.nodes[n].bbox));
}

/** Where a metric is pointed at: the centre of its focus structures, else its anchor. */
export function focusPoint(metric: MetricKey): Vec3 {
  if (!focusStructures(metric).length) return BM.metrics[metric].anchor;
  const [a, b] = metricBox(metric);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/** Diffusion radius of the tint, from the size of the focus structures. */
export function hotRadius(metric: MetricKey): number {
  const [a, b] = metricBox(metric);
  const half = 0.5 * Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return Math.min(0.26, Math.max(0.15, half * 1.6));
}

/** Tap proxy box of a region. Regions whose nodes span the body use their metrics' boxes. */
export function regionBox(region: Region): Box {
  const nodes = BM.contract_regions[region].nodes.map((n) => BM.model.nodes[n].bbox);
  const whole = unionBox(nodes);
  if (region === 'whole_body' || whole[1][1] - whole[0][1] < 0.5 * BODY_H) return whole;
  return unionBox(BM.contract_regions[region].metrics.map(metricBox));
}

/** Triangle ranges [first, count] of a metric's focus structures, per GLB node. */
export function focusRanges(metric: MetricKey): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const { node, s } of focusStructures(metric)) if (s.t) (out[node] ??= []).push(s.t);
  return out;
}

export const isIllustrative = (metric: MetricKey): boolean => BM.metrics[metric].localisation === 'illustrative';

/** "Cmdr. Ana Silva" -> "AS" (titles ending in a dot are skipped). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w && !w.endsWith('.'))
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Consecutive days, ending on day i, on which the metric was not green. */
export function daysRunning(member: CrewMember, data: CrewData, key: MetricKey, i: number, ctx: ScoreContext): number {
  let n = 0;
  for (let j = i; j >= 0; j--) {
    const s = scoreMetric(key, data.metrics[key], member.baseline[key], member.series, j, ctx);
    if (!s || s.status === 'green') break;
    n += 1;
  }
  return n;
}

export function decimalsOf(values: (number | null)[]): number {
  let d = 0;
  for (const v of values) {
    if (v == null) continue;
    const s = String(v);
    const p = s.indexOf('.');
    if (p >= 0) d = Math.max(d, s.length - p - 1);
  }
  return Math.min(d, 2);
}
