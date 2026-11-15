// Lineage graph helpers for the orbital map: typed access to docs/lineage.json,
// polar layout, edge routes (spoke + ring arc) and path queries.
// The graph itself (nodes, edges, status, owner, refs) is read from lineage.json;
// only the placement on the rings lives here.
import lineageJson from '../../../docs/lineage.json';

export type LStatus = 'live' | 'simulated' | 'planned' | 'offline-sample';
export type LKind = 'api' | 'core' | 'dataset' | 'device' | 'model' | 'person' | 'surface';

export interface LNode {
  id: string;
  label: string;
  kind: LKind;
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
  meta: { layers: Record<string, string>; status_legend: Record<LStatus, string>; counts: { nodes: number; edges: number } };
  nodes: LNode[];
  edges: LEdge[];
}

export const LINEAGE = lineageJson as unknown as LineageFile;
export const NODES = LINEAGE.nodes;
export const EDGES = LINEAGE.edges;
export const NODE_BY_ID: Record<string, LNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

/* ------------------------------------------------------------------ layout */

/** Ring radii in map units (1 unit = 1 px at 1080p). Index 0 is the centre mark. */
export const RADII = [0, 125, 250, 325, 390, 452];
export const RING_NAMES = ['Bus', 'Core', 'Adapters', 'Files, models', 'Devices, feeds', 'Outside'];

/**
 * Placement: id -> [ring, angle]. Angle in degrees, counter-clockwise from
 * 3 o'clock. Crew sits in the upper half, Storm in the lower half; inputs lean
 * left, outputs lean right; the ground link runs along the 3 o'clock spoke.
 */
const PLACE: Record<string, [number, number]> = {
  core_bus: [0, 0],

  core_observation: [1, 150],
  core_scoring: [1, 112],
  core_escalation: [1, 38],
  core_handoff: [1, 344],
  core_radiation: [1, 250],

  ad_loader: [2, 166],
  ad_replay: [2, 144],
  ad_sim_dosimeter: [2, 122],
  ad_sim_biomonitor: [2, 100],
  ad_ble_hr: [2, 78],
  ad_manual: [2, 56],
  ad_registry: [2, 28],
  ad_spaceweather: [2, 237],

  ml_generator: [3, 167],
  ml_crew_flags: [3, 151],
  ds_crew_data: [3, 133],
  ml_real_crew: [3, 111],
  ds_real_crew: [3, 89],
  sf_console: [3, 67],
  person_cmo: [3, 45],
  sf_wrist: [3, 27],
  sf_systems: [3, 11],
  ml_fetch_donki: [3, 192],
  ml_prepare: [3, 210],
  ml_model_v1: [3, 228],
  ml_export: [3, 246],
  ds_storm_forecast: [3, 264],
  sf_radiation: [3, 318],

  dev_tmini: [4, 156],
  dev_actiwatch: [4, 141],
  dev_dosimeter: [4, 122],
  dev_biomonitor: [4, 100],
  dev_ble_strap: [4, 78],
  crew: [4, 56],
  dev_bioanalyzer: [4, 38],
  core_link: [4, 0],
  api_iswa_hapi: [4, 197],
  api_radlab: [4, 209],
  api_swpc_scales: [4, 222],
  api_swpc_protons: [4, 237],
  api_swpc_xray: [4, 255],
  api_swpc_alerts: [4, 273],
  api_swpc_kp: [4, 291],

  ds_published_ranges: [5, 163],
  ds_osd575: [5, 111],
  api_corquaid: [5, 49],
  api_wheretheiss: [5, 37],
  api_isslive: [5, 25],
  ext_cmo_da: [5, 12],
  sf_ground: [5, 0],
  person_surgeon: [5, 348],
  api_donki: [5, 192],
};

export interface Placed {
  ring: number;
  r: number;
  a: number;
  x: number;
  y: number;
}

export const polar = (r: number, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return { x: r * Math.cos(t), y: -r * Math.sin(t) };
};

/** Nodes missing from PLACE (a regenerated lineage file) land on the outer ring, evenly spread in a free arc. */
const unplaced = NODES.filter((n) => !PLACE[n.id]);
export const PLACED: Record<string, Placed> = Object.fromEntries(
  NODES.map((n) => {
    const i = unplaced.indexOf(n);
    const [ring, a] = PLACE[n.id] ?? [5, 290 + (i * 44) / Math.max(1, unplaced.length)];
    const r = RADII[ring];
    return [n.id, { ring, r, a, ...polar(r, a) }];
  }),
);

/** Nodes of one ring in reading order (counter-clockwise from the left hairline is awkward: go clockwise from 9 o'clock over the top). */
export function ringNodes(ring: number): LNode[] {
  const key = (a: number) => (540 - a) % 360;
  return NODES.filter((n) => PLACED[n.id].ring === ring).sort((p, q) => key(PLACED[p.id].a) - key(PLACED[q.id].a));
}
export const ORDERED: LNode[] = [0, 1, 2, 3, 4, 5].flatMap(ringNodes);

/* ------------------------------------------------------------------ routes */

export interface Route {
  /** Full path: spoke at the outer node's angle, then an arc on the inner node's ring. */
  d: string;
  /** Spoke part only (the arc lies on a ring and needs no extra ink at rest). */
  spoke: string | null;
  len: number;
  /** Position at t in 0..1, travelling from -> to. */
  at: (t: number) => { x: number; y: number };
}

export function routeBetween(fromId: string, toId: string): Route {
  const A = PLACED[fromId];
  const B = PLACED[toId];
  const forward = A.r >= B.r;
  const outer = forward ? A : B;
  const inner = forward ? B : A;
  const spokeLen = outer.r - inner.r;
  let dA = inner.r === 0 ? 0 : (((inner.a - outer.a) % 360) + 540) % 360 - 180;
  if (dA === -180) dA = 180;
  const arcLen = (inner.r * Math.abs(dA) * Math.PI) / 180;
  const len = spokeLen + arcLen;
  const atS = (s: number) =>
    s <= spokeLen || arcLen === 0
      ? polar(outer.r - Math.min(s, spokeLen), outer.a)
      : polar(inner.r, outer.a + (dA * (s - spokeLen)) / arcLen);
  const p0 = polar(outer.r, outer.a);
  const p1 = polar(inner.r, outer.a);
  const p2 = polar(inner.r, inner.a);
  const f = (v: number) => v.toFixed(1);
  const line = spokeLen > 0 ? `M${f(p0.x)} ${f(p0.y)}L${f(p1.x)} ${f(p1.y)}` : `M${f(p1.x)} ${f(p1.y)}`;
  const arc = arcLen > 0 ? `A${inner.r} ${inner.r} 0 0 ${dA > 0 ? 0 : 1} ${f(p2.x)} ${f(p2.y)}` : '';
  return {
    d: line + arc,
    spoke: spokeLen > 0 ? line : null,
    len,
    at: (t) => atS((forward ? t : 1 - t) * len),
  };
}

export const ROUTES: Route[] = EDGES.map((e) => routeBetween(e.from, e.to));
const EDGE_INDEX = new Map(EDGES.map((e, i) => [`${e.from}>${e.to}`, i]));
export const edgeIndex = (from: string, to: string): number => EDGE_INDEX.get(`${from}>${to}`) ?? -1;

/* ----------------------------------------------------------------- queries */

/** Edges that are a plain forward data flow (or a publish back onto the bus). */
const isFlow = (e: LEdge) => !e.relation || e.relation === 'bus-publish';
const BUS = 'core_bus';

function closure(start: string, dir: 'up' | 'down', stopAt: (id: string) => boolean): { nodes: Set<string>; edges: Set<number> } {
  const nodes = new Set<string>();
  const edges = new Set<number>();
  const queue = [start];
  while (queue.length) {
    const id = queue.pop() as string;
    EDGES.forEach((e, i) => {
      const here = dir === 'up' ? e.to : e.from;
      const next = dir === 'up' ? e.from : e.to;
      if (here !== id || next === start) return;
      // Relations (parity test, calibration note, ...) are shown one hop out only.
      if (!isFlow(e) && id !== start) return;
      edges.add(i);
      if (!nodes.has(next)) {
        nodes.add(next);
        if (!stopAt(next) && isFlow(e)) queue.push(next);
      }
    });
  }
  return { nodes, edges };
}

/** Upstream and downstream of one node. The bus is a hub, so the walk stops there. */
export function neighbourhood(id: string) {
  const stop = (n: string) => n === BUS;
  return { up: closure(id, 'up', stop), down: closure(id, 'down', stop) };
}

/** Storm sector: everything that feeds the radiation core without passing the crew file loader. */
const stormUp = closure('core_radiation', 'up', (n) => n === 'ad_loader' || n === BUS);
stormUp.nodes.delete('ad_loader');
stormUp.nodes.delete(BUS);
const STORM = new Set<string>([...stormUp.nodes, 'core_radiation', 'sf_radiation', 'api_iswa_hapi', 'api_radlab']);
const sharedDown = closure('core_radiation', 'down', (n) => n === BUS).nodes;
const SHARED = new Set<string>([...sharedDown, BUS, 'sf_wrist', 'sf_systems'].filter((n) => !STORM.has(n)));
export type Sector = 'crew' | 'storm' | 'both';
export const sectorOf = (id: string): Sector => (STORM.has(id) ? 'storm' : SHARED.has(id) ? 'both' : 'crew');

/** Build = Tomas's Python pipeline before the app loads; runtime = inside the app. */
export const edgeStage = (e: LEdge): 'build' | 'runtime' => (NODE_BY_ID[e.to].stage === 'build' ? 'build' : 'runtime');
const STAGES: Record<string, Set<string>> = {};
EDGES.forEach((e) => {
  const s = edgeStage(e);
  (STAGES[e.from] ??= new Set()).add(s);
  (STAGES[e.to] ??= new Set()).add(s);
});
export const inStage = (id: string, stage: 'build' | 'runtime' | null) =>
  stage === null || (STAGES[id]?.has(stage) ?? NODE_BY_ID[id].stage === stage);

/**
 * Full path of one crew metric: every sensor or source that carries it, through
 * adapters, the Observation normaliser, the bus and scoring, to the console and
 * on to the ground. `metricKeys` are the keys of crew_data.json `metrics`.
 */
export function metricTrace(key: string, metricKeys: readonly string[], isDose: boolean) {
  const keys = new Set(metricKeys);
  const carried = (n: LNode) => [...n.fields, ...(n.maps_to ?? [])];
  // A node that names specific metrics takes part only if it names this one.
  const allowed = (n: LNode) => {
    if (n.id === 'core_radiation' || n.id === 'sf_radiation') return isDose;
    if (['sf_wrist', 'sf_systems', 'ad_registry', 'ext_cmo_da'].includes(n.id)) return false;
    const c = carried(n).filter((f) => keys.has(f));
    return c.length === 0 || c.includes(key);
  };
  const ok = new Set(NODES.filter(allowed).map((n) => n.id));
  const walk = (starts: string[], dir: 'up' | 'down') => {
    const seen = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
      const id = queue.pop() as string;
      for (const e of EDGES) {
        if (!isFlow(e)) continue;
        const here = dir === 'down' ? e.from : e.to;
        const next = dir === 'down' ? e.to : e.from;
        if (here === id && ok.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  const sources = NODES.filter((n) => n.layer === 0 && carried(n).includes(key)).map((n) => n.id);
  const fwd = walk(sources.filter((s) => ok.has(s)), 'down');
  const back = walk(['person_surgeon', 'sf_console'], 'up');
  const nodes = new Set<string>([...fwd].filter((n) => back.has(n)));
  // Planned sensors that name this metric stay visible even though they end at the registry.
  sources.forEach((s) => nodes.add(s));
  const edges = new Set<number>();
  EDGES.forEach((e, i) => {
    if (!isFlow(e)) return;
    if (nodes.has(e.from) && nodes.has(e.to)) edges.add(i);
    else if (sources.includes(e.from) && !back.has(e.from)) {
      edges.add(i);
      nodes.add(e.to);
    }
  });
  return { nodes, edges, sources };
}
