// Flight Record, chapter 04: the graph, the trace layout and the replay maths.
// Nodes, edges, labels and status all come from docs/lineage.json. Only the
// placement on the page (which node sits on which branch) is decided here.
import raw from '../../../docs/lineage.json';
import { contextFor, scoreDay, type MetricScore } from '../../core/scoring';
import type { CrewData, EnvironmentId, FlareEvent, MetricKey, Status, StormForecast } from '../../data/types';

export type NodeStatus = 'live' | 'simulated' | 'planned' | 'offline-sample';

export interface LNode {
  id: string;
  label: string;
  kind: string;
  status: NodeStatus;
  layer: number;
  owner: string;
  source: string;
  url: string | null;
  license: string | null;
  cadence: string;
  fields: string[];
  ref: string[];
  note?: string;
  maps_to?: string[];
  samples?: string[];
  impl?: string;
  path?: string;
  stage?: string;
}

export interface LEdge {
  from: string;
  to: string;
  payload: string;
  fields?: string[];
  status: NodeStatus;
  relation?: string;
}

interface LGraph {
  meta: { layers: Record<string, string>; status_legend: Record<string, string>; counts: { nodes: number; edges: number } };
  nodes: LNode[];
  edges: LEdge[];
}

export const GRAPH = raw as unknown as LGraph;
export const NODE: Record<string, LNode> = Object.fromEntries(GRAPH.nodes.map((n) => [n.id, n]));
export const LAYERS = GRAPH.meta.layers;

export const STATUS_WORD: Record<NodeStatus, string> = {
  live: 'Live',
  simulated: 'Simulated',
  planned: 'Planned',
  'offline-sample': 'Offline sample',
};
export const STATUS_SHORT: Record<NodeStatus, string> = {
  live: '',
  simulated: 'sim',
  planned: 'planned',
  'offline-sample': 'sample',
};
export const DASH: Record<NodeStatus, string | undefined> = {
  live: undefined,
  simulated: '7 4',
  planned: '1 4',
  'offline-sample': '8 3 1 3',
};
export const ownerMark = (owner: string): string => (owner === 'Tomas' ? 'T' : owner === 'Emile' ? 'E' : 'X');

export const upstream = (id: string): LEdge[] => GRAPH.edges.filter((e) => e.to === id);
export const downstream = (id: string): LEdge[] => GRAPH.edges.filter((e) => e.from === id);
const edgeBetween = (a: string, b: string): LEdge | undefined =>
  GRAPH.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

/* ------------------------------------------------------------------ placement */

export type ReadingKey = MetricKey | 'storm';

/** Stations a crew reading passes, in order. */
export const CREW_PATH = [
  'ds_crew_data',
  'ad_loader',
  'ad_replay',
  'core_observation',
  'core_bus',
  'core_scoring',
  'sf_console',
  'core_escalation',
  'core_link',
  'sf_ground',
  'person_surgeon',
];

/** Stations a storm forecast passes, in order. */
const STORM_PATH = [
  'api_donki',
  'ml_fetch_donki',
  'ml_prepare',
  'ml_model_v1',
  'ml_export',
  'ds_storm_forecast',
  'core_radiation',
  'core_escalation',
  'core_link',
  'sf_ground',
  'person_surgeon',
];

/** The line on the page is always the path of the followed reading. */
export const pathFor = (key: ReadingKey): string[] => (key === 'storm' ? STORM_PATH : CREW_PATH);

export interface Group {
  id: string;
  title: string;
  nodes: string[];
}

/** Hand placement: which nodes are read together. Everything else is derived from the edges. */
const GROUP_DEFS: Group[] = [
  { id: 'sources', title: 'Crew pipeline', nodes: ['ml_crew_flags', 'ml_generator', 'ds_published_ranges', 'api_iswa_hapi', 'api_radlab'] },
  { id: 'weather', title: 'Space weather', nodes: ['ad_spaceweather', 'api_swpc_scales', 'api_swpc_protons', 'api_swpc_xray', 'api_swpc_alerts', 'api_swpc_kp'] },
  { id: 'adapters', title: 'Adapters', nodes: ['ad_manual', 'ad_ble_hr', 'ad_sim_biomonitor', 'ad_sim_dosimeter', 'ad_registry'] },
  { id: 'devices', title: 'Devices', nodes: ['crew', 'dev_ble_strap', 'dev_biomonitor', 'dev_dosimeter', 'dev_bioanalyzer', 'dev_actiwatch', 'dev_tmini'] },
  { id: 'reference', title: 'Reference', nodes: ['ds_real_crew', 'ml_real_crew', 'ds_osd575'] },
  { id: 'storm', title: 'Storm chain', nodes: ['core_radiation', 'ds_storm_forecast', 'ml_export', 'ml_model_v1', 'ml_prepare', 'ml_fetch_donki', 'api_donki'] },
  { id: 'crewline', title: 'Crew readings', nodes: ['core_scoring', 'core_bus', 'core_observation', 'ad_replay', 'ad_loader', 'ds_crew_data', 'sf_console'] },
  { id: 'surfaces', title: 'Surfaces', nodes: ['sf_radiation', 'sf_wrist', 'sf_systems'] },
  { id: 'context', title: 'Context feeds', nodes: ['api_isslive', 'api_wheretheiss', 'api_corquaid'] },
  { id: 'handoff', title: 'Handoff', nodes: ['core_handoff', 'ext_cmo_da', 'person_cmo'] },
];

const grouped = new Set<string>([...CREW_PATH, ...STORM_PATH, ...GROUP_DEFS.flatMap((g) => g.nodes)]);
/** A lineage node nobody placed by hand still shows up, in its own branch. */
export const UNPLACED = GRAPH.nodes.filter((n) => !grouped.has(n.id)).map((n) => n.id);
const GROUPS: Group[] = UNPLACED.length ? [...GROUP_DEFS, { id: 'unplaced', title: 'Unplaced', nodes: UNPLACED }] : GROUP_DEFS;

export interface Branch {
  id: string;
  title: string;
  /** up: feeds the station. down: fed by the station. */
  side: 'up' | 'down';
  /** Index of the station on the path. -1 when no edge reaches the path. */
  at: number;
  /** Where the title is drawn (same as `at` unless that slot was taken). */
  slot: number;
  status: NodeStatus;
  /** The branch itself first, then the groups that reach the path only through it. */
  tabs: Group[];
  total: number;
}

/** Branches off a path. Side and station come from the real edges, never from a hand-set slot. */
export function branchesOn(path: string[]): Branch[] {
  const idx = new Map(path.map((id, i) => [id, i] as const));
  const groups = GROUPS.map((g) => ({ ...g, nodes: g.nodes.filter((n) => !idx.has(n)) })).filter((g) => g.nodes.length);
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const n of g.nodes) groupOf.set(n, g.id);

  const taken = new Set<string>();
  const out: Branch[] = [];
  const rootOf = new Map<string, Branch>();
  const pending: Group[] = [];

  for (const g of groups) {
    const tally = new Map<string, { side: 'up' | 'down'; at: number; n: number; status: NodeStatus }>();
    const add = (side: 'up' | 'down', at: number, e: LEdge) => {
      const k = `${side}:${at}`;
      const t = tally.get(k);
      if (t) t.n++;
      else tally.set(k, { side, at, n: 1, status: e.status });
    };
    for (const plain of [true, false]) {
      for (const e of GRAPH.edges) {
        if (plain !== !e.relation) continue;
        if (groupOf.get(e.from) === g.id && idx.has(e.to)) add('up', idx.get(e.to) as number, e);
        if (groupOf.get(e.to) === g.id && idx.has(e.from)) add('down', idx.get(e.from) as number, e);
      }
      if (tally.size) break;
    }
    if (!tally.size) {
      pending.push(g);
      continue;
    }
    const free = (t: { side: string; at: number }) => (taken.has(`${t.side}:${t.at}`) ? 1 : 0);
    const pick = [...tally.values()].sort(
      (a, b) => free(a) - free(b) || b.n - a.n || (a.side === 'up' ? 0 : 1) - (b.side === 'up' ? 0 : 1) || a.at - b.at,
    )[0];
    let slot = pick.at;
    for (let d = 1; taken.has(`${pick.side}:${slot}`) && d < path.length; d++) {
      const cand = [pick.at + d, pick.at - d].find((s) => s >= 0 && s < path.length && !taken.has(`${pick.side}:${s}`));
      if (cand !== undefined) slot = cand;
    }
    taken.add(`${pick.side}:${slot}`);
    const b: Branch = { id: g.id, title: g.title, side: pick.side, at: pick.at, slot, status: pick.status, tabs: [g], total: g.nodes.length };
    out.push(b);
    rootOf.set(g.id, b);
  }

  // Groups that reach the path only through another group ride along as a tab of that branch.
  let moved = true;
  while (moved && pending.length) {
    moved = false;
    for (const g of [...pending]) {
      const votes = new Map<string, number>();
      for (const e of GRAPH.edges) {
        const a = groupOf.get(e.from);
        const b = groupOf.get(e.to);
        const other = a === g.id ? b : b === g.id ? a : undefined;
        if (other && other !== g.id && rootOf.has(other)) votes.set(other, (votes.get(other) ?? 0) + 1);
      }
      const best = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
      if (!best) continue;
      const root = rootOf.get(best[0]) as Branch;
      root.tabs.push(g);
      root.total += g.nodes.length;
      rootOf.set(g.id, root);
      pending.splice(pending.indexOf(g), 1);
      moved = true;
    }
  }
  // No edge at all: still visible, drawn loose at the end of the line.
  for (const g of pending) {
    let slot = path.length - 1;
    while (slot > 0 && taken.has(`down:${slot}`)) slot--;
    taken.add(`down:${slot}`);
    out.push({ id: g.id, title: g.title, side: 'down', at: -1, slot, status: NODE[g.nodes[0]].status, tabs: [g], total: g.nodes.length });
  }
  return out;
}

export interface Pt {
  x: number;
  y: number;
}
export interface Layout {
  w: number;
  h: number;
  y0: number;
  step: number;
  /** Station names sit on two rows when one row would collide. */
  stagger: boolean;
  nameSize: number;
  maxChars: number;
  pos: Record<string, Pt>;
  title: Record<string, Pt>;
}

/** Vertical distances from the line, in px. */
export const GEO = { top: 112, upTitle: -64, num: 34, name: 60, name2: 84, count: 82, downTitle: 132, below: 172, tray: 136 };

const CHAR = 0.56;
export const textWidth = (s: string, size: number): number => s.length * size * CHAR;

export function layout(w: number, h: number, path: string[], branches: Branch[]): Layout {
  const padL = Math.max(64, Math.min(120, w * 0.07));
  const padR = Math.max(64, Math.min(110, w * 0.065));
  const step = (w - padL - padR) / (path.length - 1);
  const fits = (size: number) =>
    path.every((id, i) => i === 0 || (textWidth(NODE[id].label, size) + textWidth(NODE[path[i - 1]].label, size)) / 2 < step - 14);
  const stagger = !fits(18);
  const nameSize = stagger ? (step < 110 ? 15 : 17) : 18;
  const maxChars = Math.floor(((stagger ? 2 : 1) * step - 16) / (nameSize * CHAR));
  const spare = Math.max(0, h - GEO.top - GEO.below - GEO.tray);
  const y0 = Math.round(GEO.top + spare * 0.42);
  const pos: Record<string, Pt> = {};
  const title: Record<string, Pt> = {};
  path.forEach((id, i) => {
    pos[id] = { x: padL + i * step, y: y0 };
  });
  for (const b of branches) {
    const drop = b.side === 'down' && stagger ? 20 : 0;
    title[b.id] = { x: padL + b.slot * step, y: y0 + (b.side === 'up' ? GEO.upTitle : GEO.downTitle + drop) };
  }
  return { w, h, y0, step, stagger, nameSize, maxChars, pos, title };
}

export const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

/** Other nodes that carry this metric (devices that would feed it, adapters, surfaces). */
export function carriers(key: ReadingKey): Set<string> {
  const out = new Set<string>();
  if (key === 'storm') return out;
  for (const n of GRAPH.nodes) {
    if (n.maps_to?.includes(key) || n.fields.includes(key)) out.add(n.id);
  }
  for (const e of GRAPH.edges) {
    if (e.fields?.includes(key)) {
      out.add(e.from);
      out.add(e.to);
    }
  }
  return out;
}

/** The line through the stations, with the distance of each station along it. */
export function tracePath(path: string[], lay: Layout): { d: string; stops: number[]; length: number } {
  const stops = path.map((id) => lay.pos[id].x - lay.pos[path[0]].x);
  const a = lay.pos[path[0]];
  const b = lay.pos[path[path.length - 1]];
  return { d: `M${a.x.toFixed(1)} ${a.y} L${b.x.toFixed(1)} ${b.y}`, stops, length: b.x - a.x };
}

/** Status of the link between two neighbouring stations. */
export const hopStatus = (a: string, b: string): NodeStatus => edgeBetween(a, b)?.status ?? NODE[b].status;

/* ----------------------------------------------------------------------- replay */

export interface Replay {
  dates: string[];
  /** Cumulative through day i, all crew, all metrics. */
  obs: number[];
  flags: number[];
  reds: number[];
  /** Flares with a peak on or before day i, and how many raised watch or warning. */
  flares: number[];
  alerts: number[];
  /** scores[crewIndex][dayIndex] */
  scores: MetricScore[][][];
  events: FlareEvent[];
  /** Cumulative alerts by event index. */
  alertsByEvent: number[];
  /** Events at warning level, whole file. */
  warnings: number;
}

export function buildReplay(crew: CrewData, storm: StormForecast, env: EnvironmentId): Replay {
  const ctx = contextFor(crew, env);
  const dates = crew.crew[0]?.series.map((r) => r.date) ?? [];
  const scores = crew.crew.map((m) => m.series.map((_, i) => scoreDay(m, crew.metrics, i, ctx)));
  const keys = Object.keys(crew.metrics) as MetricKey[];
  const events = [...storm.events].sort((a, b) => a.peak_time.localeCompare(b.peak_time));
  const alertsByEvent: number[] = [];
  let a = 0;
  for (const e of events) {
    if (e.alert_level !== 'none') a++;
    alertsByEvent.push(a);
  }
  const obs: number[] = [];
  const flags: number[] = [];
  const reds: number[] = [];
  const flares: number[] = [];
  const alerts: number[] = [];
  let o = 0;
  let f = 0;
  let r = 0;
  let ei = 0;
  dates.forEach((date, i) => {
    crew.crew.forEach((m, ci) => {
      const row = m.series[i];
      if (row) for (const k of keys) if (row[k] !== null) o++;
      for (const s of scores[ci][i] ?? []) {
        if (s.status !== 'green') f++;
        if (s.status === 'red') r++;
      }
    });
    while (ei < events.length && events[ei].peak_time.slice(0, 10) <= date) ei++;
    obs.push(o);
    flags.push(f);
    reds.push(r);
    flares.push(ei);
    alerts.push(ei > 0 ? alertsByEvent[ei - 1] : 0);
  });
  return { dates, obs, flags, reds, flares, alerts, scores, events, alertsByEvent, warnings: events.filter((e) => e.alert_level === 'warning').length };
}

export interface Count {
  n: number;
  unit: string;
}

/**
 * What each node has handled through mission day `day`. Flare counts are the
 * whole of storm_forecast.json (one definition everywhere): every event in the
 * file, and how many of them raised a watch or a warning.
 */
export function countsAt(rp: Replay, day: number, storm: boolean): Record<string, Count> {
  const o = rp.obs[day] ?? 0;
  const f = rp.flags[day] ?? 0;
  const r = rp.reds[day] ?? 0;
  const fl = rp.events.length;
  const al = rp.alertsByEvent[rp.events.length - 1] ?? 0;
  const c = (n: number, unit: string): Count => ({ n, unit });
  const sent = storm ? c(rp.warnings, 'warnings') : c(r, 'red reports');
  return {
    ds_crew_data: c(o, 'values'),
    ad_loader: c(o, 'values'),
    ad_replay: c(o, 'readings'),
    core_observation: c(o, 'readings'),
    core_bus: c(o + f + al, 'events'),
    core_scoring: c(f, 'flags'),
    sf_console: c(f, 'flags'),
    core_escalation: storm ? c(al, 'alerts') : c(f, 'flags'),
    core_handoff: c(f, 'flags'),
    person_cmo: c(r, 'red flags'),
    core_link: sent,
    sf_ground: sent,
    person_surgeon: sent,
    api_donki: c(fl, 'flares'),
    ml_fetch_donki: c(fl, 'flares'),
    ml_prepare: c(fl, 'flares'),
    ml_export: c(fl, 'flares'),
    ds_storm_forecast: c(fl, 'flares'),
    core_radiation: c(al, 'alerts'),
    sf_radiation: c(al, 'alerts'),
  };
}

export const alertStatus = (e: FlareEvent): Status =>
  e.alert_level === 'warning' ? 'red' : e.alert_level === 'watch' ? 'amber' : 'green';

/** The storm event the Storm reading follows: the latest real storm, else the latest alert. */
export function stormPick(rp: Replay): number {
  for (let i = rp.events.length - 1; i >= 0; i--) if (rp.events[i].actual_storm) return i;
  for (let i = rp.events.length - 1; i >= 0; i--) if (rp.events[i].alert_level !== 'none') return i;
  return rp.events.length - 1;
}

export const fmt = (n: number): string => n.toLocaleString('en-US');
