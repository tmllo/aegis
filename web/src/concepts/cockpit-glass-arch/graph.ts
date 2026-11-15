// Lineage graph, column layout and orthogonal routing for the signal schematic.
// The single source of nodes and edges is docs/lineage.json.
import raw from '../../../docs/lineage.json';

export type LStatus = 'live' | 'simulated' | 'planned' | 'offline-sample';

export interface LNode {
  id: string;
  label: string;
  kind: 'api' | 'core' | 'dataset' | 'device' | 'model' | 'person' | 'surface';
  status: LStatus;
  layer: number;
  owner: string;
  source: string;
  url: string | null;
  license: string | null;
  cadence: string | null;
  fields: string[];
  ref: string[];
  stage?: 'build' | 'runtime';
  impl?: string;
  note?: string;
  samples?: string[];
  maps_to?: string[];
  path?: string;
  metric_keys?: string[];
  loinc?: Record<string, string | null>;
}

export interface LEdge {
  from: string;
  to: string;
  payload: string;
  fields: string[];
  status: LStatus;
  ref: string[];
  relation?: string;
  note?: string;
}

interface LineageFile {
  meta: { layers: Record<string, string>; status_legend: Record<LStatus, string>; generated: string };
  nodes: LNode[];
  edges: LEdge[];
}

export const LINEAGE = raw as unknown as LineageFile;
export const NODES: LNode[] = LINEAGE.nodes;
export const EDGES: LEdge[] = LINEAGE.edges;
export const NODE: Record<string, LNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const edgeKey = (e: Pick<LEdge, 'from' | 'to'>): string => `${e.from}>${e.to}`;
export const EDGE: Record<string, LEdge> = Object.fromEntries(EDGES.map((e) => [edgeKey(e), e]));

export const BUS_ID = 'core_bus';
export const GATE_ID = 'core_observation';

/* ------------------------------------------------------------------ columns */

export type Slot = 'feeds' | 'sources' | 'build' | 'files' | 'adapters' | 'gate' | 'rail' | 'core' | 'surfaces';
const SLOTS: Slot[] = ['feeds', 'sources', 'build', 'files', 'adapters', 'gate', 'rail', 'core', 'surfaces'];
export const SLOT_INDEX = Object.fromEntries(SLOTS.map((s, i) => [s, i])) as Record<Slot, number>;

/** Column of a node, derived from its kind, stage and layer (not from its id, except the two bus parts). */
export function slotOf(n: LNode): Slot {
  if (n.id === BUS_ID) return 'rail';
  if (n.id === GATE_ID) return 'gate';
  if (n.kind === 'api' && n.status === 'offline-sample') return 'feeds';
  if (n.layer === 0 && !n.stage) return 'sources';
  if (n.kind === 'model') return 'build';
  if (n.kind === 'dataset' && n.path) return 'files';
  if (n.kind === 'core') return n.layer <= 1 ? 'adapters' : 'core';
  return 'surfaces';
}

/** The eight printed columns. Bus is the rail with the Observation segment on it. */
export const COLUMNS: { title: string; slots: Slot[] }[] = [
  { title: 'Feeds', slots: ['feeds'] },
  { title: 'Devices / Data', slots: ['sources'] },
  { title: 'Build', slots: ['build'] },
  { title: 'Files', slots: ['files'] },
  { title: 'Adapters', slots: ['adapters'] },
  { title: 'Bus', slots: ['gate', 'rail'] },
  { title: 'Core', slots: ['core'] },
  { title: 'Surfaces', slots: ['surfaces'] },
];

/** Presentational row per node (0 = top). Unknown ids fall into the next free row. */
const ROW: Record<string, number> = {
  api_iswa_hapi: 0, api_radlab: 1, api_swpc_scales: 2, api_swpc_protons: 3, api_swpc_xray: 4,
  api_swpc_alerts: 5, api_swpc_kp: 6, api_isslive: 7, api_wheretheiss: 8, api_corquaid: 9,
  ds_osd575: 0, ds_published_ranges: 1, api_donki: 3, crew: 4, dev_ble_strap: 5, dev_biomonitor: 6,
  dev_dosimeter: 7, dev_bioanalyzer: 8, dev_actiwatch: 9, dev_tmini: 10,
  ml_real_crew: 0, ml_generator: 1, ml_crew_flags: 2, ml_fetch_donki: 3, ml_prepare: 4, ml_model_v1: 5, ml_export: 6,
  ds_real_crew: 0, ds_crew_data: 2, ds_storm_forecast: 6,
  ad_spaceweather: 1, ad_loader: 2, ad_replay: 3, ad_manual: 4, ad_ble_hr: 5, ad_sim_biomonitor: 6,
  ad_sim_dosimeter: 7, ad_registry: 9,
  core_radiation: 1, core_scoring: 3, core_escalation: 5, core_handoff: 7, core_link: 9,
  sf_radiation: 1, sf_console: 3, sf_wrist: 4, person_cmo: 5, sf_systems: 6, ext_cmo_da: 7, sf_ground: 9,
  person_surgeon: 10,
};
export const ROWS = 11;

/* ------------------------------------------------------------------ traversal */

const PLAIN = (e: LEdge): boolean => !e.relation;
const FLOW = (e: LEdge): boolean => !e.relation || e.relation === 'bus-publish';

const INCOMING: Record<string, LEdge[]> = {};
const OUTGOING: Record<string, LEdge[]> = {};
for (const n of NODES) {
  INCOMING[n.id] = [];
  OUTGOING[n.id] = [];
}
for (const e of EDGES) {
  OUTGOING[e.from]?.push(e);
  INCOMING[e.to]?.push(e);
}
export const incoming = (id: string): LEdge[] => INCOMING[id] ?? [];
export const outgoing = (id: string): LEdge[] => OUTGOING[id] ?? [];

/** Every node reachable against the flow over plain forward edges. */
export function ancestors(id: string, ok: (e: LEdge) => boolean = PLAIN): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const e of incoming(cur)) {
      if (!ok(e) || seen.has(e.from) || e.from === id) continue;
      seen.add(e.from);
      queue.push(e.from);
    }
  }
  return seen;
}

export interface Focus {
  /** node id -> hop order used for the stagger. */
  nodes: Map<string, number>;
  edges: Map<string, number>;
  /** The one path shown at full accent. Absent = everything in the focus is the path. */
  mainNodes?: Set<string>;
  mainEdges?: Set<string>;
}

/**
 * Edges the runtime replay moves packets along (see replay.ts). These are the
 * trunks drawn at rest; every other edge stays faint until a path is lit.
 */
export const REPLAY_EDGES: ReadonlySet<string> = new Set([
  'ds_crew_data>ad_loader', 'ad_loader>ad_replay', 'ad_replay>core_observation', 'core_observation>core_bus',
  'core_bus>core_scoring', 'core_scoring>core_bus', 'core_bus>sf_console', 'core_bus>sf_wrist', 'core_bus>sf_systems',
  'core_scoring>core_escalation', 'core_escalation>core_bus', 'core_escalation>core_link', 'core_link>sf_ground',
  'sf_ground>person_surgeon', 'core_escalation>core_handoff', 'core_handoff>sf_console', 'core_escalation>person_cmo',
  'ds_storm_forecast>core_radiation', 'core_radiation>core_bus', 'core_bus>sf_radiation', 'core_radiation>core_escalation',
]);
export const REPLAY_NODES: ReadonlySet<string> = new Set([...REPLAY_EDGES].flatMap((k) => k.split('>')));

/**
 * Upstream and downstream of one node. The walk stops at the bus (the bus is
 * included but not expanded), so a path reads "to the spine" instead of lighting
 * every surface. Selecting the bus itself lights its direct neighbours.
 */
export function focusOfNode(id: string): Focus {
  const up = new Map<string, number>();
  const down = new Map<string, number>();
  const upEdges = new Map<string, number>();
  const downEdges = new Map<string, number>();
  const walk = (dir: 'up' | 'down') => {
    const depth = dir === 'up' ? up : down;
    const edges = dir === 'up' ? upEdges : downEdges;
    const queue: [string, number][] = [[id, 0]];
    while (queue.length) {
      const [cur, d] = queue.shift() as [string, number];
      if (cur === BUS_ID && cur !== id) continue;
      if (id === BUS_ID && d >= 1) continue;
      for (const e of dir === 'up' ? incoming(cur) : outgoing(cur)) {
        // Relation edges (parity test, user input, display) only count next to the picked node.
        if (!FLOW(e) && d > 0) continue;
        const next = dir === 'up' ? e.from : e.to;
        if (!edges.has(edgeKey(e))) edges.set(edgeKey(e), d + 1);
        if (next === id || depth.has(next)) continue;
        depth.set(next, d + 1);
        queue.push([next, d + 1]);
      }
    }
  };
  walk('up');
  walk('down');
  const maxUp = Math.max(0, ...up.values());
  const nodes = new Map<string, number>([[id, maxUp]]);
  const edges = new Map<string, number>();
  // Upstream lights first (farthest source first), then downstream.
  up.forEach((d, n) => nodes.set(n, maxUp - d));
  upEdges.forEach((d, k) => edges.set(k, maxUp - d));
  down.forEach((d, n) => {
    if (!nodes.has(n)) nodes.set(n, maxUp + d);
  });
  downEdges.forEach((d, k) => {
    if (!edges.has(k)) edges.set(k, maxUp + d);
  });
  // One path at full strength: the breadcrumb chain into the node, and its direct outputs.
  const crumb = breadcrumb(id).map((n) => n.id);
  const mainNodes = new Set<string>(crumb);
  const mainEdges = new Set<string>();
  for (let i = 1; i < crumb.length; i++) mainEdges.add(`${crumb[i - 1]}>${crumb[i]}`);
  for (const e of outgoing(id)) {
    mainNodes.add(e.to);
    mainEdges.add(edgeKey(e));
  }
  if (id === BUS_ID) for (const e of incoming(id)) {
    mainNodes.add(e.from);
    mainEdges.add(edgeKey(e));
  }
  return { nodes, edges, mainNodes, mainEdges };
}

const carries = (n: LNode, metric: string): boolean =>
  n.fields.includes(metric) || !!n.maps_to?.includes(metric) || !!n.metric_keys?.includes(metric);

/** Fixed part of every metric path: normalize, bus, scoring, console, escalation, link, ground. */
const DOWNSTREAM: string[] = [
  'core_observation>core_bus',
  'core_bus>core_scoring',
  'core_scoring>core_bus',
  'core_bus>sf_console',
  'core_scoring>core_escalation',
  'core_escalation>person_cmo',
  'core_escalation>core_handoff',
  'core_handoff>sf_console',
  'core_escalation>core_link',
  'core_link>sf_ground',
  'sf_ground>person_surgeon',
];

/** Full path of one crew metric: every sensor or file that carries it, through the bus, to the ground. */
export function focusOfMetric(metric: string): Focus {
  const toGate = ancestors(GATE_ID);
  const carriers = NODES.filter((n) => n.layer === 0 && carries(n, metric) && toGate.has(n.id)).map((n) => n.id);
  const set = new Set<string>(carriers);
  // Forward from the carriers, staying on routes that reach the Observation gate.
  const queue = [...carriers];
  while (queue.length) {
    const cur = queue.shift() as string;
    for (const e of outgoing(cur)) {
      if (!PLAIN(e) || set.has(e.to) || !toGate.has(e.to)) continue;
      set.add(e.to);
      queue.push(e.to);
    }
  }
  // An adapter fed by a device counts only when one of its devices carries the metric.
  for (const e of incoming(GATE_ID)) {
    const devices = incoming(e.from).filter((i) => PLAIN(i) && NODE[i.from]?.layer === 0);
    if (devices.length && !devices.some((i) => carriers.includes(i.from))) set.delete(e.from);
  }
  // What the generator was built from (published ranges; the DONKI storm date only places dose).
  for (const id of carriers) {
    for (const e of incoming(id)) {
      const src = NODE[e.from];
      if (!src || !PLAIN(e) || e.status === 'planned') continue;
      if (src.kind === 'api' && !metric.startsWith('dose')) continue;
      set.add(e.from);
    }
  }
  set.add(GATE_ID);
  const edges = new Map<string, number>();
  const nodes = new Map<string, number>();
  const order = (id: string): number => SLOT_INDEX[slotOf(NODE[id])];
  for (const e of EDGES) {
    if (PLAIN(e) && set.has(e.from) && set.has(e.to)) edges.set(edgeKey(e), order(e.from));
  }
  set.forEach((id) => nodes.set(id, order(id)));
  let step = SLOTS.length;
  for (const k of DOWNSTREAM) {
    const e = EDGE[k];
    if (!e) continue;
    edges.set(k, step);
    if (!nodes.has(e.to)) nodes.set(e.to, step + 1);
    step += 1;
  }
  return { nodes, edges };
}

/** Upstream chain as a short breadcrumb, source first. */
export function breadcrumb(id: string, max = 5): LNode[] {
  const chain: LNode[] = [NODE[id]];
  let cur = id;
  while (chain.length < max) {
    const ins = incoming(cur).filter(PLAIN);
    const next = ins.find((e) => e.status !== 'planned') ?? ins[0];
    if (!next || chain.some((n) => n.id === next.from)) break;
    chain.unshift(NODE[next.from]);
    cur = next.from;
  }
  return chain;
}

/** Simulated crew chain and real DONKI storm chain, for the Crew / Storm toggle. */
function chainSets(): { crew: Set<string>; storm: Set<string> } {
  const withSelf = (id: string): string[] => (NODE[id] ? [id, ...ancestors(id)] : []);
  const storm = new Set<string>([
    ...withSelf('ds_storm_forecast'),
    ...withSelf('ad_spaceweather'),
    ...['core_radiation', BUS_ID, 'sf_radiation', 'sf_systems', 'core_escalation', 'core_link', 'sf_ground', 'person_surgeon'],
  ]);
  const crew = new Set<string>([
    ...withSelf(GATE_ID),
    ...withSelf('ds_real_crew'),
    ...withSelf('ad_registry'),
    ...[BUS_ID, 'core_scoring', 'core_escalation', 'core_handoff', 'core_link', 'ext_cmo_da'],
    ...['sf_console', 'sf_wrist', 'sf_systems', 'person_cmo', 'sf_ground', 'person_surgeon'],
  ]);
  return { crew, storm };
}
export const CHAINS = chainSets();

/** A build-time edge runs inside the Python pipeline, before the app loads. */
export function isBuildEdge(e: LEdge): boolean {
  const s = NODE[e.from];
  const t = NODE[e.to];
  if (!s || !t || t.stage === 'runtime') return false;
  return s.stage === 'build' || t.stage === 'build';
}
export const isBuildNode = (n: LNode): boolean =>
  n.stage === 'build' || outgoing(n.id).some(isBuildEdge) || incoming(n.id).some(isBuildEdge);

/* ------------------------------------------------------------------ layout */

export type Pt = [number, number];

export interface Box {
  id: string;
  slot: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface Header {
  index: string;
  title: string;
  owners: string;
  x: number;
  w: number;
}

export interface Layout {
  W: number;
  H: number;
  pitch: number;
  rowsTop: number;
  railX: number;
  boxes: Record<string, Box>;
  pts: Record<string, Pt[]>;
  d: Record<string, string>;
  headers: Header[];
}

export const HEADER_H = 60;
export const NODE_H = 52;
/** Width of the Observation segment drawn on the rail. */
const GATE_W = 8;
const GUTTER = 42;
/** Wider gutter in front of the rail: holds the Observation label. */
const RAIL_GUTTER = 112;
const TRACK = 5;
/** Narrowest canvas at which a node still holds a 16 px name on two lines; below it the stage pans. */
export const MIN_W = 1400;

function rounded(pts: Pt[], r = 4): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const a = Math.min(r, Math.hypot(cx - px, cy - py) / 2);
    const b = Math.min(r, Math.hypot(nx - cx, ny - cy) / 2);
    const ax = cx - Math.sign(cx - px) * a;
    const ay = cy - Math.sign(cy - py) * a;
    const bx = cx + Math.sign(nx - cx) * b;
    const by = cy + Math.sign(ny - cy) * b;
    d += ` L${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

/** Drops zero-length steps so corners stay clean. */
const tidy = (pts: Pt[]): Pt[] =>
  pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) > 0.5 || Math.abs(p[1] - pts[i - 1][1]) > 0.5);

export function computeLayout(W: number, H: number): Layout {
  const padX = 20;
  const nodeW = Math.max(120, Math.min(176, (W - 2 * padX - RAIL_GUTTER - 6 * GUTTER) / 7));
  const rowsTop = HEADER_H + 6;
  const pitch = Math.max(56, (H - rowsTop - 6) / ROWS);
  const rowY = (r: number): number => rowsTop + r * pitch + (pitch - NODE_H) / 2;

  // Slot x positions; the rail is a zero-width slot with a gutter on each side.
  // The gate has no column of its own: it is a segment of the rail.
  const slotW = SLOTS.map((s) => (s === 'gate' || s === 'rail' ? 0 : nodeW));
  const gutterAfter = SLOTS.map((s) => (s === 'adapters' ? RAIL_GUTTER : s === 'gate' ? 0 : GUTTER));
  const slotX: number[] = [];
  let x = padX;
  SLOTS.forEach((_, i) => {
    slotX.push(x);
    x += slotW[i] + gutterAfter[i];
  });
  const railX = slotX[SLOT_INDEX.rail];

  // Rows.
  const used: Record<number, Set<number>> = {};
  const boxes: Record<string, Box> = {};
  const gateRows = incoming(GATE_ID)
    .filter(PLAIN)
    .map((e) => ROW[e.from])
    .filter((r): r is number => r !== undefined);
  const gateTop = gateRows.length ? Math.min(...gateRows) : 3;
  const gateBottom = gateRows.length ? Math.max(...gateRows) : 7;
  for (const n of NODES) {
    const slot = SLOT_INDEX[slotOf(n)];
    if (n.id === BUS_ID) {
      const y = rowsTop;
      const h = ROWS * pitch;
      boxes[n.id] = { id: n.id, slot, row: -1, x: railX, y, w: 0, h, cx: railX, cy: y + h / 2 };
      continue;
    }
    if (n.id === GATE_ID) {
      const y = rowY(gateTop) - 6;
      const h = rowY(gateBottom) + NODE_H + 6 - y;
      boxes[n.id] = { id: n.id, slot, row: -1, x: railX - GATE_W / 2, y, w: GATE_W, h, cx: railX, cy: y + h / 2 };
      continue;
    }
    const taken = (used[slot] ??= new Set<number>());
    let row = ROW[n.id];
    if (row === undefined || taken.has(row)) {
      row = 0;
      while (taken.has(row)) row += 1;
    }
    taken.add(row);
    const y = rowY(row);
    boxes[n.id] = { id: n.id, slot, row, x: slotX[slot], y, w: nodeW, h: NODE_H, cx: slotX[slot] + nodeW / 2, cy: y + NODE_H / 2 };
  }
  const all = Object.values(boxes);

  // Track allocators: edges that share a trunk share a track.
  const gutterTracks: Record<number, Map<string, number>> = {};
  const cap = Math.floor((GUTTER - 18) / TRACK) + 1;
  const trackX = (g: number, key: string): number => {
    const m = (gutterTracks[g] ??= new Map<string, number>());
    if (!m.has(key)) m.set(key, m.size);
    return slotX[g] + slotW[g] + 9 + ((m.get(key) as number) % cap) * TRACK;
  };
  const laneTracks: Record<number, Map<string, number>> = {};
  const laneY = (lane: number, key: string): number => {
    const m = (laneTracks[lane] ??= new Map<string, number>());
    if (!m.has(key)) m.set(key, m.size);
    return rowsTop + lane * pitch + (((m.get(key) as number) % 5) - 2) * TRACK;
  };
  const blocked = (y: number, a: number, b: number): boolean =>
    all.some((bx) => bx.id !== BUS_ID && bx.slot > Math.min(a, b) && bx.slot < Math.max(a, b) && y > bx.y - 5 && y < bx.y + bx.h + 5);
  const between = (s: Box, t: Box): boolean =>
    all.some((bx) => bx.slot === s.slot && bx.row > Math.min(s.row, t.row) && bx.row < Math.max(s.row, t.row));

  const pts: Record<string, Pt[]> = {};
  const d: Record<string, string> = {};
  const railSlot = SLOT_INDEX.rail;

  for (const e of EDGES) {
    const s = boxes[e.from];
    const t = boxes[e.to];
    if (!s || !t) continue;
    let p: Pt[];

    if (e.to === BUS_ID) {
      // Into the rail: one straight run. Publishers from the right sit a little lower.
      const fromRight = s.slot > railSlot;
      const y = e.from === GATE_ID ? s.cy : s.cy + (fromRight ? 9 : 0);
      p = [[fromRight ? s.x : s.x + s.w, y], [railX, y]];
    } else if (e.from === BUS_ID) {
      if (t.slot === railSlot + 1) {
        p = [[railX, t.cy - 9], [t.x, t.cy - 9]];
      } else {
        const ly = laneY(t.row, `bus:${t.id}`);
        const tx = trackX(t.slot - 1, `t:${t.id}`);
        p = [[railX, ly], [tx, ly], [tx, t.cy], [t.x, t.cy]];
      }
    } else if (s.slot === t.slot) {
      if (!between(s, t)) {
        const down = t.row > s.row;
        p = [[s.cx, down ? s.y + s.h : s.y], [t.cx, down ? t.y : t.y + t.h]];
      } else {
        const left = SLOTS[s.slot] === 'adapters';
        const g = left ? s.slot - 1 : s.slot;
        const tx = trackX(g, left ? `t:${t.id}` : `s:${s.id}`);
        const down = t.row > s.row;
        const sx = left ? s.x : s.x + s.w;
        const sy = s.cy + (down ? 12 : -12);
        const ty = t.cy + (down ? -12 : 12);
        p = [[sx, sy], [tx, sy], [tx, ty], [left ? t.x : t.x + t.w, ty]];
      }
    } else {
      const fwd = t.slot > s.slot;
      const sOut = fwd ? s.x + s.w : s.x;
      const tIn = fwd ? t.x : t.x + t.w;
      const sY = s.cy;
      const tall = e.to === GATE_ID;
      const tY = tall ? Math.min(Math.max(sY, t.y + 12), t.y + t.h - 12) : t.cy;
      const gS = fwd ? s.slot : s.slot - 1;
      const gT = fwd ? t.slot - 1 : t.slot;
      if (gS === gT) {
        const tx = trackX(gS, `s:${s.id}`);
        p = sY === tY ? [[sOut, sY], [tIn, tY]] : [[sOut, sY], [tx, sY], [tx, tY], [tIn, tY]];
      } else if (!blocked(sY, s.slot, t.slot)) {
        const tx = trackX(gT, `t:${t.id}`);
        p = sY === tY ? [[sOut, sY], [tIn, tY]] : [[sOut, sY], [tx, sY], [tx, tY], [tIn, tY]];
      } else if (!blocked(tY, s.slot, t.slot)) {
        const tx = trackX(gS, `s:${s.id}`);
        p = [[sOut, sY], [tx, sY], [tx, tY], [tIn, tY]];
      } else {
        const lane = s.row < t.row ? t.row : s.row > t.row ? t.row + 1 : t.row;
        // Keyed by target, so a fan-in shares one trunk.
        const ly = laneY(lane, `t:${t.id}`);
        const txS = trackX(gS, `t:${t.id}`);
        const txT = trackX(gT, `t:${t.id}`);
        p = [[sOut, sY], [txS, sY], [txS, ly], [txT, ly], [txT, tY], [tIn, tY]];
      }
    }
    const key = edgeKey(e);
    pts[key] = tidy(p);
    d[key] = rounded(pts[key]);
  }

  // Printed column headers with the owners found in each column.
  const headers: Header[] = COLUMNS.map((c, i) => {
    const idx = c.slots.map((s) => SLOT_INDEX[s]);
    const first = Math.min(...idx);
    const last = Math.max(...idx);
    const owners = [...new Set(NODES.filter((n) => c.slots.includes(slotOf(n))).map((n) => n.owner))];
    const isBus = c.slots.includes('rail');
    return {
      index: String(i + 1).padStart(2, '0'),
      title: c.title,
      owners: owners.join(' / '),
      x: isBus ? railX - 46 : slotX[first],
      w: isBus ? 92 : slotX[last] + slotW[last] - slotX[first],
    };
  });

  return { W, H, pitch, rowsTop, railX, boxes, pts, d, headers };
}

/** Point at fraction t (0..1) of a polyline. */
export function pointAt(pts: Pt[], t: number): Pt {
  if (pts.length === 1) return pts[0];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l);
    total += l;
  }
  let want = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] === 0 ? 0 : want / seg[i];
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}

export const lengthOf = (pts: Pt[]): number => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
};
