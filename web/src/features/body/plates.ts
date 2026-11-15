// Plate model for the Flight Record body: seven numbered plates, finer than the
// five contract regions. Where things sit comes from docs/body-map.json; how
// severe they are comes only from core/scoring on crew_data.json.
import bodyMapJson from '../../../docs/body-map.json';
import {
  BONE_LOSS_AMBER_PCT,
  DOSE_CUM_AMBER_FRACTION,
  DOSE_DAY_AMBER_FACTOR,
  contextFor,
  statusOn,
  worst,
  type MetricScore,
} from '../../core/scoring';
import { ANCHOR_OVERRIDES, STRUCTURE_RANGES, type Layer, type Vec3 } from './model/bodyModel';
import type { CrewData, CrewMember, EnvironmentId, MetricKey, Status } from '../../data/types';

export type PlateId = 'temp' | 'brain' | 'dose' | 'heart' | 'blood' | 'bone' | 'muscle';
export type NodeName = Layer;
export type { Vec3 };

interface MapMetric {
  anchor: Vec3;
  view_deg: number;
  localisation: string;
  parts: Record<string, 'all' | string[]>;
  focus?: Record<string, string[]>;
  measure_site: { label: string } | null;
}
interface MapStructure {
  n: string;
  t: [number, number] | null;
}
interface BodyMap {
  metrics: Record<MetricKey, MapMetric>;
  structure_index: Record<string, MapStructure[]>;
}
const bodyMap = bodyMapJson as unknown as BodyMap;

interface PlateDef {
  id: PlateId;
  /** 1-2 words, the row name. */
  name: string;
  metrics: MetricKey[];
  /** GLB node that takes the ink. null = drawn as the dose contour. */
  node: NodeName | null;
  /** Camera distance in metres when this plate is selected. null = stay wide. */
  zoom: number | null;
  /** Which side of the body the plate's label sits on in the overview. */
  side: 'left' | 'right';
  /**
   * Whole-body plates have no organ to point at. Their leader ends on the body
   * outline, at the shoulder skin point the body map carries for this metric.
   */
  outlineAt?: MetricKey;
  /** The outline point is pushed out to the dose contour. */
  onContour?: boolean;
}

// NOTE: this block (sides, outlineAt, DEF_BY_ID) and the numbering sort in buildPlates were
// reconstructed after an overlapping edit overwrote them. Verify the values against your intent.
const DEFS: PlateDef[] = [
  { id: 'temp', name: 'Temperature', metrics: ['temp'], node: 'whole_body', zoom: null, side: 'left', outlineAt: 'dose_mSv_cum' },
  { id: 'brain', name: 'Brain', metrics: ['sleep_h', 'mood'], node: 'brain', zoom: 2.3, side: 'left' },
  { id: 'dose', name: 'Radiation', metrics: ['dose_mSv_day', 'dose_mSv_cum'], node: null, zoom: null, side: 'right', outlineAt: 'dose_mSv_day', onContour: true },
  { id: 'heart', name: 'Heart', metrics: ['bp_sys', 'bp_dia', 'hr'], node: 'heart', zoom: 2.4, side: 'left' },
  { id: 'blood', name: 'Blood', metrics: ['glucose'], node: 'blood', zoom: 2.7, side: 'right' },
  { id: 'bone', name: 'Bone', metrics: ['bone_loss_pct'], node: 'bones_loadbearing', zoom: 3.35, side: 'left' },
  { id: 'muscle', name: 'Muscle', metrics: ['exercise_min'], node: 'muscle_antigravity', zoom: 3.35, side: 'right' },
];
const DEF_BY_ID = new Map(DEFS.map((d) => [d.id, d]));

const ORDER: Record<Status, number> = { green: 0, amber: 1, red: 2 };

export interface Plate {
  id: PlateId;
  /** Plate number as printed, '01' to '07'. */
  no: string;
  name: string;
  node: NodeName | null;
  zoom: number | null;
  side: 'left' | 'right';
  status: Status;
  /** Scores for this plate's metrics, worst first. */
  scores: MetricScore[];
  /** Worst-scored metric: the one the row and the on-body note show. */
  primary: MetricKey;
  illustrative: boolean;
}

export const anchorOf = (metric: MetricKey): Vec3 => ANCHOR_OVERRIDES[metric] ?? bodyMap.metrics[metric].anchor;
/**
 * Where a plate's mark, hit target and leader end. Organ plates: the shown
 * metric's anchor. Whole-body plates: a fixed point on the outline, pushed out
 * by `standoff` metres when the plate is drawn as the dose contour.
 */
export function plateAnchor(plate: Pick<Plate, 'id'>, metric: MetricKey, standoff: number, nearNote = false): Vec3 {
  const def = DEF_BY_ID.get(plate.id)!;
  if (!def.outlineAt) return anchorOf(metric);
  const [ax, y, z] = anchorOf(def.outlineAt);
  // Selected: the note sits on the left, so the rule ends on the outline's near (left) shoulder.
  const x = nearNote ? -Math.abs(ax) : ax;
  return def.onContour ? [x + Math.sign(x) * standoff, y, z] : [x, y, z];
}
const headAnchor = (id: PlateId): Vec3 => plateAnchor({ id }, DEF_BY_ID.get(id)!.metrics[0], 0);
export const viewDegOf = (metric: MetricKey): number => bodyMap.metrics[metric].view_deg;
export const measureSiteOf = (metric: MetricKey): string | null => bodyMap.metrics[metric].measure_site?.label ?? null;

/** Builds the seven plates for one crew member on mission.today. */
export function buildPlates(member: CrewMember, data: CrewData, environment: EnvironmentId): Plate[] {
  const { scores } = statusOn(member, data, data.mission.today, environment);
  const byMetric = new Map(scores.map((s) => [s.metric, s]));
  const plates = DEFS.map((def) => {
    const own = def.metrics
      .filter((m) => m in data.metrics)
      .map((m) => byMetric.get(m))
      .filter((s): s is MetricScore => !!s)
      .sort((a, b) => ORDER[b.status] - ORDER[a.status]);
    const primary = own[0]?.metric ?? def.metrics[0];
    return {
      id: def.id,
      no: '',
      name: def.name,
      node: def.node,
      zoom: def.zoom,
      side: def.side,
      status: own.reduce<Status>((acc, s) => worst(acc, s.status), 'green'),
      scores: own,
      primary,
      illustrative: def.metrics.some((m) => bodyMap.metrics[m].localisation === 'illustrative'),
    };
  });
  // Numbered from the head down, by the height of each plate's anchor.
  plates.sort((a, b) => headAnchor(b.id)[1] - headAnchor(a.id)[1]);
  plates.forEach((p, i) => (p.no = String(i + 1).padStart(2, '0')));
  return plates;
}

/** Review order for Prev / Next: worst first, then plate number. */
export function reviewOrder(plates: Plate[]): Plate[] {
  return [...plates].sort((a, b) => ORDER[b.status] - ORDER[a.status] || a.no.localeCompare(b.no));
}

/** Consecutive days, ending today, on which the file carries a flag for this metric. */
export function daysRunning(member: CrewMember, metric: MetricKey, today: string): number {
  const flagged = new Set(member.flags.filter((f) => f.metric === metric).map((f) => f.date));
  let i = member.series.findIndex((r) => r.date === today);
  let n = 0;
  while (i >= 0 && flagged.has(member.series[i].date)) {
    n++;
    i--;
  }
  return n;
}

export interface Reference {
  kind: 'band' | 'threshold';
  /** band: mean - 2 sd; threshold: unused. */
  lo: number | null;
  /** band: mean + 2 sd; threshold: the caution line. */
  hi: number;
  mean: number | null;
  /** Hard limit from absolute_red, when it is a meaningful upper bound. */
  limit: number | null;
}

/** What a value is read against: the person's own band, or an absolute line for dose and bone loss. */
export function referenceFor(member: CrewMember, metric: MetricKey, data: CrewData, environment: EnvironmentId): Reference {
  const b = member.baseline[metric];
  if (b) return { kind: 'band', lo: b.mean - 2 * b.sd, hi: b.mean + 2 * b.sd, mean: b.mean, limit: null };
  const ctx = contextFor(data, environment);
  const limit = data.metrics[metric].absolute_red.max;
  const hi =
    metric === 'dose_mSv_day'
      ? DOSE_DAY_AMBER_FACTOR * ctx.envDosePerDay
      : metric === 'dose_mSv_cum'
        ? DOSE_CUM_AMBER_FRACTION * ctx.careerLimit_mSv
        : metric === 'bone_loss_pct'
          ? BONE_LOSS_AMBER_PCT
          : limit;
  return { kind: 'threshold', lo: null, hi, mean: null, limit };
}

/** Mission dose as a fraction of the career limit, 0 to 1. Drives the dose contour. */
export function doseFraction(member: CrewMember, data: CrewData): number {
  const today = member.series.find((r) => r.date === data.mission.today);
  const cum = today?.dose_mSv_cum ?? 0;
  return Math.max(0, Math.min(1, cum / data.career_limit_mSv));
}

/**
 * Per-vertex ink weight for one node when `metric` is the one shown:
 * 1 on the metric's focus structures, 0.7 on its other structures, 0 elsewhere.
 * Structures are triangle ranges from body-map.json structure_index.
 */
export function inkWeights(node: NodeName, metric: MetricKey, index: ArrayLike<number>, vertexCount: number): Float32Array {
  const out = new Float32Array(vertexCount);
  // A model without matching structure ranges takes the colour on the whole layer.
  if (!STRUCTURE_RANGES) return out.fill(1);
  const m = bodyMap.metrics[metric];
  const parts = m.parts[node];
  if (!parts) return out;
  const focus = new Set(m.focus?.[node] ?? []);
  const allowed = parts === 'all' ? null : new Set(parts);
  const hasFocus = focus.size > 0;
  for (const s of bodyMap.structure_index[node] ?? []) {
    if (!s.t) continue;
    if (allowed && !allowed.has(s.n)) continue;
    const w = !hasFocus || focus.has(s.n) ? 1 : 0.7;
    const end = (s.t[0] + s.t[1]) * 3;
    for (let i = s.t[0] * 3; i < end; i++) {
      const v = index[i];
      if (out[v] < w) out[v] = w;
    }
  }
  return out;
}

/** Farthest distance from an anchor to the node's bounding box: the reach of the ink reveal. */
export function reachOf(box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, anchor: Vec3): number {
  const { min, max } = box;
  let d = 0;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) d = Math.max(d, Math.hypot(x - anchor[0], y - anchor[1], z - anchor[2]));
  return d + 0.05;
}

/** First sentence of a text from the file (bottom-bar next step, note summary). */
export const firstSentence = (text: string): string => text.split(/(?<=\.)\s/)[0];

/**
 * Short reading names for the tabs, derived from the file's labels: the
 * bracketed part is dropped (or used alone when two labels would then match),
 * then words that another reading of the same plate also carries are dropped.
 */
export function shortLabels(metrics: MetricKey[], data: CrewData): Record<string, string> {
  const bare = (m: MetricKey) => data.metrics[m].label.replace(/\s*\(.*\)$/, '');
  const first = metrics.map((m) => {
    const clash = metrics.some((o) => o !== m && bare(o) === bare(m));
    const inner = data.metrics[m].label.match(/\((.*)\)$/)?.[1];
    return clash && inner ? inner : bare(m);
  });
  const out: Record<string, string> = {};
  metrics.forEach((m, i) => {
    const others = new Set(first.filter((_, j) => j !== i).flatMap((l) => l.toLowerCase().split(/\s+/)));
    const kept = first[i].split(/\s+/).filter((w) => !others.has(w.toLowerCase()));
    const label = (kept.length ? kept : first[i].split(/\s+/)).join(' ');
    out[m] = label.charAt(0).toUpperCase() + label.slice(1);
  });
  return out;
}


/** At most `digits` decimals (default two), no trailing zeros. */
export const fmt = (v: number, digits = 2): string => String(Number(v.toFixed(digits)));
