// Flight Record, chapter 04 "Record": the data system told as the life of one
// reading, followed along a trace from its source to the flight surgeon.
// Graph: docs/lineage.json. Values: crew_data.json and storm_forecast.json
// replayed through core/scoring. Nothing here repeats a number from the files.
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { AMBER_Z, regionStatus } from '../../core/scoring';
import { seriesToObservations } from '../../core/observation';
import type { ConceptMeta } from '../../registry';
import type { MetricKey, Region, Status } from '../../data/types';
import { Figure } from './Figure';
import {
  BRANCHES,
  BRANCH_OF,
  DASH,
  GRAPH,
  LAYERS,
  NODE,
  SPINE,
  STATUS_SHORT,
  STATUS_WORD,
  alertStatus,
  branchFor,
  buildReplay,
  carriers,
  countsAt,
  downstream,
  fitsBoth,
  fmt,
  layout,
  ownerMark,
  pathFor,
  sideOf,
  stormPick,
  tracePath,
  upstream,
  type NodeStatus,
  type Pt,
  type ReadingKey,
} from './model';
import './flight.css';

export const meta: ConceptMeta = {
  title: 'Flight Record: Record',
  direction: 'Flight Record',
  surface: 'architecture',
};

const TONE: Record<Status, string> = { green: 'var(--c-ok)', amber: 'var(--c-warn)', red: 'var(--c-crit)' };
const STATUS_LABEL: Record<Status, string> = { green: 'In range', amber: 'Watch', red: 'Act now' };
const ALERT_LABEL = { none: 'No alert', watch: 'Watch', warning: 'Warning' } as const;
const ESCALATION: Record<Status, string> = {
  green: 'Self-care, nobody is told',
  amber: 'Flag for the next medical conference',
  red: 'Crew medical officer now, report to flight surgeon queued',
};
const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
/** Packet clock, marker hop and dwell. */
const TICK_MS = 1200;
const HOP_MS = 480;
const DWELL_MS = 2600;
/** Length of the strip beside the value: recent days, or recent flares. */
const WINDOW_DAYS = 14;
const WINDOW_EVENTS = 40;

/** Status shape: dot, triangle, square. Colour is never the only signal. */
function Shape({ status, size = 10 }: { status: Status; size?: number }) {
  const c = TONE[status];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      {status === 'green' && <circle cx="5" cy="5" r="4" fill={c} />}
      {status === 'amber' && <path d="M5 0.8 9.6 9.2H0.4Z" fill={c} />}
      {status === 'red' && <rect x="1" y="1" width="8" height="8" fill={c} />}
    </svg>
  );
}

function Swatch({ status, w = 28 }: { status: NodeStatus; w?: number }) {
  return (
    <svg width={w} height="8" aria-hidden>
      <line x1="0" y1="4" x2={w} y2="4" stroke="var(--paper)" strokeWidth={status === 'planned' ? 2 : 1.5} strokeLinecap={status === 'planned' ? 'round' : undefined} strokeDasharray={DASH[status]} />
    </svg>
  );
}

const query = () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

/** A bad state shows a message and a way back, never a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { message: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="fr fr-fail">
        <div className="fr-label">Record</div>
        <h1>The record could not be drawn.</h1>
        <p className="fr-mono">{this.state.message}</p>
        <button onClick={() => window.location.assign(window.location.pathname)}>Reset view</button>
      </div>
    );
  }
}

export default function FlightRecordArch() {
  return (
    <Boundary>
      <Record />
    </Boundary>
  );
}

/** Recent values on the personal band (or recent flares on the alert thresholds). */
function Strip({
  values,
  band,
  lines,
  mark,
  tone,
  bars,
  left,
  right,
}: {
  values: (number | null)[];
  band: [number, number] | null;
  lines: { v: number; label: string }[];
  mark: number;
  tone: Status;
  bars: boolean;
  left: string;
  right: string;
}) {
  const W = 400;
  const H = 132;
  const px = { l: 2, r: W - 64, t: 10, b: H - 30 };
  const nums = values.filter((v): v is number => v !== null);
  const all = [...nums, ...(band ?? []), ...lines.map((l) => l.v), ...(bars ? [0] : [])];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (!(hi > lo)) {
    hi = lo + 1;
    lo -= 1;
  }
  const padY = bars ? 0 : (hi - lo) * 0.12;
  lo -= padY;
  hi += padY;
  const X = (i: number) => px.l + (values.length > 1 ? (i / (values.length - 1)) * (px.r - px.l - 8) : 0) + 4;
  const Y = (v: number) => px.b - ((v - lo) / (hi - lo)) * (px.b - px.t);
  const pts = values.map((v, i) => (v === null ? null : `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).filter(Boolean);
  const mv = values[mark];
  return (
    <svg className="fr-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${left}, ${right}`}>
      {band && (
        <>
          <rect x={px.l} y={Y(band[1])} width={px.r - px.l} height={Math.max(1, Y(band[0]) - Y(band[1]))} fill="var(--paper)" opacity={0.08} />
          <line x1={px.l} x2={px.r} y1={Y(band[1])} y2={Y(band[1])} stroke="var(--paper-2)" strokeWidth={1} />
          <line x1={px.l} x2={px.r} y1={Y(band[0])} y2={Y(band[0])} stroke="var(--paper-2)" strokeWidth={1} />
          <text x={px.r + 8} y={Y(band[1]) + 5} className="t-mono">
            {band[1].toFixed(1)}
          </text>
          <text x={px.r + 8} y={Y(band[0]) + 5} className="t-mono">
            {band[0].toFixed(1)}
          </text>
        </>
      )}
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={px.l} x2={px.r} y1={Y(l.v)} y2={Y(l.v)} stroke="var(--paper-2)" strokeWidth={1} strokeDasharray="5 4" />
          <text x={px.r + 8} y={Y(l.v) + 5} className="t-mono">
            {l.label}
          </text>
        </g>
      ))}
      {bars ? (
        values.map((v, i) =>
          v === null ? null : (
            <line key={i} x1={X(i)} x2={X(i)} y1={px.b} y2={Math.min(px.b - 2, Y(v))} stroke={i === mark ? TONE[tone] : 'var(--paper-2)'} strokeWidth={i === mark ? 4 : 2} />
          ),
        )
      ) : (
        <polyline points={pts.join(' ')} fill="none" stroke="var(--paper)" strokeWidth={1.75} strokeLinejoin="round" />
      )}
      {!bars && mv !== null && mv !== undefined && (
        <>
          <circle cx={X(mark)} cy={Y(mv)} r={9} fill="none" stroke={TONE[tone]} strokeWidth={1.25} />
          <circle cx={X(mark)} cy={Y(mv)} r={4.5} fill={TONE[tone]} />
        </>
      )}
      <line x1={px.l} x2={px.r} y1={px.b + 0.5} y2={px.b + 0.5} stroke="var(--line)" />
      <text x={px.l} y={H - 8} className="t-cap">
        {left}
      </text>
      <text x={px.r} y={H - 8} textAnchor="end" className="t-cap">
        {right}
      </text>
    </svg>
  );
}

function Record() {
  const { data, loadState, error } = useMissionData();
  const member = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);

  const init = useMemo(query, []);
  const [reading, setReading] = useState<string | null>(init.get('reading'));
  const [at, setAt] = useState(() => Number(init.get('at') ?? 0) || 0);
  const [moveMs, setMoveMs] = useState(0);
  const [sel, setSel] = useState<string | null>(() => {
    const s = init.get('sel');
    return s && NODE[s] ? s : null;
  });
  // The marker walks by itself only until the first touch. After that the reader owns the place.
  const [auto, setAuto] = useState(!(init.has('hold') || init.has('sel') || init.has('at') || init.has('index') || init.has('open')));
  const touched = useRef(false);
  const [showIndex, setShowIndex] = useState(init.has('index'));
  const [layer, setLayer] = useState<string>(() => {
    const s = init.get('sel');
    return s && NODE[s] ? String(NODE[s].layer) : init.get('layer') ?? Object.keys(LAYERS)[0];
  });
  const [openState, setOpenState] = useState<{ up: string | null; down: string | null }>(() => {
    const o = { up: null as string | null, down: null as string | null };
    const want = [...(init.get('open')?.split(',') ?? []), BRANCH_OF[init.get('sel') ?? ''] ?? ''];
    for (const id of want) if (BRANCHES.some((b) => b.id === id)) o[sideOf(id)] = id;
    return o;
  });
  const [tick, setTick] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1920, h: 500 });
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [loadState]);

  useEffect(() => {
    const crewParam = init.get('crew');
    if (crewParam && data?.crew.crew.some((c) => c.id === crewParam)) setCrew(crewParam);
  }, [data, init, setCrew]);

  const replay = useMemo(
    () => (data && environment ? buildReplay(data.crew, data.storm, environment) : null),
    [data, environment],
  );

  // Packet clock: one mission day (or one flare) per tick. Counts do not move with it.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const crewIndex = data && member ? data.crew.crew.findIndex((c) => c.id === member.id) : -1;
  const todayIdx = replay && data ? Math.max(0, replay.dates.lastIndexOf(data.crew.mission.today)) : 0;
  const todayScores = replay && crewIndex >= 0 ? replay.scores[crewIndex][todayIdx] ?? [] : [];

  // The reading to follow by default: the worst thing on this astronaut today.
  const flagged = useMemo(() => {
    const bad = todayScores.filter((s) => s.status !== 'green');
    bad.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.score ?? 0) - (a.score ?? 0));
    return bad[0]?.metric ?? null;
  }, [todayScores]);

  const metricKeys = data ? (Object.keys(data.crew.metrics) as MetricKey[]) : [];
  const heartKey = metricKeys.find((k) => k === 'hr') ?? metricKeys[0];
  const doseKey = metricKeys.find((k) => k === 'dose_mSv_day') ?? metricKeys[metricKeys.length - 1];
  // An unknown reading in the address falls back to the default.
  const asked = reading === 'storm' || (reading !== null && metricKeys.includes(reading as MetricKey)) ? (reading as ReadingKey) : null;
  const key: ReadingKey = asked ?? flagged ?? heartKey ?? 'storm';
  const isStorm = key === 'storm';

  const path = useMemo(() => pathFor(key), [key]);
  const pathSet = useMemo(() => new Set(path), [path]);
  const also = useMemo(() => carriers(key), [key]);

  const forced = branchFor(key);
  const wantUp = forced && sideOf(forced) === 'up' ? forced : openState.up;
  const wantDown = forced && sideOf(forced) === 'down' ? forced : openState.down;
  const lay = useMemo(() => layout(size.w, size.h, wantUp, wantDown), [size.w, size.h, wantUp, wantDown]);
  const trace = useMemo(() => tracePath(path, lay), [path, lay]);

  // A station named in the address must be on this trace, else the marker starts at the source.
  const selAt = sel ? path.indexOf(sel) : -1;
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !data) return;
    setSeeded(true);
    if (selAt >= 0) setAt(selAt);
  }, [seeded, data, selAt]);
  const atSafe = Math.min(Math.max(at, 0), path.length - 1);

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const last = atSafe >= path.length - 1;
    const t = window.setTimeout(() => {
      setSel(null);
      setMoveMs(last ? 0 : HOP_MS);
      setAt(last ? 0 : atSafe + 1);
    }, DWELL_MS);
    return () => window.clearTimeout(t);
  }, [atSafe, auto, path.length]);

  if (loadState === 'error') return <p style={{ padding: 32, color: 'var(--c-crit)' }}>{error}</p>;
  if (!data || !member || !environment || !replay) return <div className="fr" />;

  const crew = data.crew;
  const storm = data.storm;

  /* ---------------------------------------------- counts: fixed at mission today */
  const counts = countsAt(replay, todayIdx, null, isStorm);
  const span = isStorm ? Math.min(WINDOW_EVENTS, replay.events.length) : Math.min(WINDOW_DAYS, todayIdx + 1);
  const cursorOf = (n: number) => {
    const k = ((n % span) + span) % span;
    return isStorm ? replay.events.length - span + k : todayIdx - span + 1 + k;
  };

  /* ----------------------------------------------------- followed reading */
  const row = member.series[todayIdx];
  const score = !isStorm ? todayScores.find((s) => s.metric === key) : undefined;
  const mMeta = !isStorm ? crew.metrics[key] : undefined;
  const eventIdx = stormPick(replay);
  const event = replay.events[eventIdx];
  const status: Status = isStorm ? alertStatus(event) : score?.status ?? 'green';
  const regions = regionStatus(todayScores, crew.metrics);
  const value = !isStorm && row ? row[key] : null;
  // A storm alert concerns the same region as the dose metric in the file.
  const region: Region = mMeta ? mMeta.body_region : crew.metrics[doseKey].body_region;

  const packetStatus = (n: number, ci: number): Status => {
    const c = cursorOf(n);
    if (isStorm) return alertStatus(replay.events[c]);
    return replay.scores[ci]?.[c]?.find((s) => s.metric === key)?.status ?? 'green';
  };

  /* ------------------------------------------------------------- actions */
  const touch = () => {
    if (touched.current) return;
    touched.current = true;
    setAuto(false);
  };
  const follow = (k: ReadingKey) => {
    setReading(k);
    setSel(null);
    setMoveMs(0);
    setAt(0);
  };
  const openBranch = (id: string | null, side: 'up' | 'down') => {
    const other = side === 'up' ? 'down' : 'up';
    const next = { ...openState, [side]: id };
    const otherOpen = other === 'up' ? wantUp : wantDown;
    // Short stage: one branch at a time.
    if (id && otherOpen && !fitsBoth(size.h)) next[other] = null;
    setOpenState(next);
  };
  const toggleBranch = (id: string) => {
    if (id === forced) return;
    const side = sideOf(id);
    openBranch(lay.open.has(id) ? null : id, side);
  };
  const select = (id: string) => {
    const i = path.indexOf(id);
    setSel(id);
    if (i >= 0) {
      setMoveMs(HOP_MS / 2);
      setAt(i);
    }
    const b = BRANCH_OF[id];
    if (b && !lay.open.has(b) && b !== forced) openBranch(b, sideOf(b));
    setLayer(String(NODE[id].layer));
  };
  const stepBy = (d: number) => {
    const i = Math.min(path.length - 1, Math.max(0, atSafe + d));
    setSel(null);
    setMoveMs(HOP_MS / 2);
    setAt(i);
  };
  const pickRegion = (r: Region) => {
    const inRegion = todayScores.filter((s) => crew.metrics[s.metric].body_region === r);
    inRegion.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.score ?? 0) - (a.score ?? 0));
    if (!inRegion.length) return;
    const i = inRegion.findIndex((s) => s.metric === key);
    follow(inRegion[(i + 1) % inRegion.length].metric);
  };
  const pickCrew = (id: string) => {
    setCrew(id);
    setReading(null);
    setSel(null);
    setMoveMs(0);
    setAt(0);
  };

  /* ------------------------------------------------ what a station holds */
  const noteId = sel && NODE[sel] ? sel : path[atSafe];
  const node = NODE[noteId];
  const sample = (id: string): string | null => {
    const n = NODE[id];
    if (isStorm) {
      const e = event;
      const m = storm.meta;
      switch (id) {
        case 'api_donki':
          return e.flare_id;
        case 'ml_fetch_donki':
          return `${e.flare_class} at ${e.source_location ?? 'unknown location'}, linked CME ${e.cme_speed_kms ?? 'none'}${e.cme_speed_kms ? ' km/s' : ''}`;
        case 'ml_prepare':
          return `class_flux ${e.class_flux}, longitude_deg ${e.longitude_deg}, has_linked_cme ${e.has_linked_cme}`;
        case 'ml_model_v1':
          return `${m.model}: watch at p ${m.thresholds.watch.toFixed(3)}, warning at p ${m.thresholds.warning.toFixed(3)}, horizon ${m.horizon_hours} h`;
        case 'ml_export':
          return `${fmt(m.metrics_test.n_flares)} test flares, ${m.metrics_test.n_storms} storms, ${m.test_period.join(' to ')}`;
        case 'ds_storm_forecast':
          return `{"flare_id":"${e.flare_id}","p_storm":${e.p_storm},"alert_level":"${e.alert_level}"}`;
        case 'core_radiation':
          return `${e.alert_level}${e.actual_storm && e.storm_onset_time ? `, particles arrive ${e.storm_onset_time}` : ''}${e.lead_time_h !== null ? `, ${e.lead_time_h} h from flare peak` : ''}`;
        case 'core_escalation':
          return e.alert_level === 'warning' ? 'Warning: crew to shelter (mission rule), report queued' : `${e.alert_level}: shown on the Radiation module`;
        case 'core_link':
          return `${crew.environments[environment].label}: ${e.alert_level === 'warning' ? 'report queued' : 'no report for a watch'}`;
        default:
          break;
      }
    } else if (mMeta && row) {
      const obs = seriesToObservations(member.id, [row], { [key]: mMeta })[0];
      const base = member.baseline[key as MetricKey];
      switch (id) {
        case 'ds_crew_data':
          return `crew[${crewIndex}].series[${todayIdx}].${key} = ${value}`;
        case 'ad_loader':
          return `${crew.crew.length} crew, ${member.series.length} days, ${metricKeys.length} metrics, typed from the contract`;
        case 'ad_replay':
        case 'core_observation':
          return JSON.stringify(obs);
        case 'core_bus':
          return `observation ${obs.subject}/${obs.metric} is one of ${fmt(counts.core_bus.n)} events on the bus`;
        case 'ml_crew_flags':
        case 'core_scoring':
          if (!score) return null;
          return score.z !== null && score.windowMean !== null && base
            ? `baseline ${base.mean} sd ${base.sd}, 3-day mean ${score.windowMean.toFixed(2)}, z ${score.z.toFixed(2)}: ${score.status}`
            : `value ${score.value} on absolute bands: ${score.status}`;
        case 'sf_console':
          return `body region ${mMeta.body_region}: ${regions[mMeta.body_region]}`;
        case 'core_escalation':
          return ESCALATION[status];
        case 'core_link':
          return `${crew.environments[environment].label}: ${status === 'red' ? 'report queued' : 'no report for this reading'}`;
        case 'sf_ground':
        case 'person_surgeon':
          return status === 'red' ? 'This reading is in the report' : `Not sent. ${fmt(counts[id].n)} red reports in the record so far`;
        default:
          break;
      }
    }
    return n.samples?.[0] ?? n.path ?? n.impl ?? null;
  };

  const uniq = (ids: string[]) => [...new Set(ids)];
  const from = uniq(upstream(noteId).map((e) => e.from));
  const to = uniq(downstream(noteId).map((e) => e.to));
  const noteSample = sample(noteId);
  const noteCount = counts[noteId];
  const pathNo = (id: string) => String(path.indexOf(id) + 1).padStart(2, '0');

  /* ------------------------------------------------------------ geometry */
  const segOn = (ends: [string, string] | null) => {
    if (!ends) return false;
    const a = path.indexOf(ends[0]);
    const b = path.indexOf(ends[1]);
    return a >= 0 && b >= 0 && Math.abs(a - b) <= 1;
  };
  const lineOf = (st: NodeStatus, on: boolean) => ({
    stroke: on ? 'var(--paper)' : st === 'live' ? 'var(--line)' : 'var(--paper-2)',
    strokeWidth: on ? 2 : st === 'planned' ? 1.75 : 1.25,
    strokeDasharray: DASH[st],
    strokeLinecap: st === 'planned' ? ('round' as const) : undefined,
  });
  /** Where a node can be pointed at right now: itself, or the folded branch that holds it. */
  const pointOf = (id: string): Pt | null => {
    const b = BRANCH_OF[id];
    if (!b) return lay.pos[id] ?? null;
    if (lay.open.has(b)) return lay.pos[id];
    return lay.shown.has(b) ? lay.title[b] : null;
  };
  const links = (() => {
    if (!sel || showIndex) return [];
    const here = pointOf(sel);
    if (!here) return [];
    const seen = new Set<string>();
    const out: { d: string; k: string }[] = [];
    const add = (a: Pt | null, b: Pt | null) => {
      if (!a || !b || (a.x === b.x && a.y === b.y)) return;
      const k = `${a.x.toFixed(0)},${a.y.toFixed(0)}>${b.x.toFixed(0)},${b.y.toFixed(0)}`;
      if (seen.has(k)) return;
      seen.add(k);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      // Stop short of the target so the arrowhead sits outside the station mark.
      const cut = Math.min(18, len / 3);
      const e = { x: b.x - (dx / len) * cut, y: b.y - (dy / len) * cut };
      let d: string;
      if (a.y === b.y && Math.abs(dx) <= lay.step * 1.05) d = `M${a.x} ${a.y}L${e.x} ${e.y}`;
      else if (a.y === b.y) d = `M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${a.y - Math.min(44, 10 + Math.abs(dx) * 0.06)} ${b.x - Math.sign(dx) * 14} ${b.y - 10}`;
      else d = `M${a.x} ${a.y}C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y - Math.sign(dy) * 16}`;
      out.push({ d, k });
    };
    for (const id of from) add(pointOf(id), here);
    for (const id of to) add(here, pointOf(id));
    return out;
  })();

  /* ---------------------------------------------------------------- strip */
  const strip = (() => {
    if (isStorm) {
      const n = Math.min(WINDOW_EVENTS, eventIdx + 1);
      const evs = replay.events.slice(eventIdx + 1 - n, eventIdx + 1);
      return {
        values: evs.map((e) => e.p_storm) as (number | null)[],
        band: null,
        lines: [
          { v: storm.meta.thresholds.watch, label: 'watch' },
          { v: storm.meta.thresholds.warning, label: 'warning' },
        ],
        mark: n - 1,
        bars: true,
        left: `Last ${n} flares`,
        right: 'p storm',
      };
    }
    const n = Math.min(WINDOW_DAYS, todayIdx + 1);
    const rows = member.series.slice(todayIdx + 1 - n, todayIdx + 1);
    const base = member.baseline[key as MetricKey];
    return {
      values: rows.map((r) => r[key as MetricKey]),
      band: base ? ([base.mean - AMBER_Z * base.sd, base.mean + AMBER_Z * base.sd] as [number, number]) : null,
      lines: [],
      mark: n - 1,
      bars: false,
      left: `${n} days`,
      right: base ? `Own band, ${AMBER_Z} sd` : 'Absolute band',
    };
  })();

  const subline = isStorm ? (
    <>
      Flare <b>{event.flare_class}</b>, {event.source_location ?? 'location unknown'}, peak {event.peak_time.slice(0, 16).replace('T', ' ')} UTC
    </>
  ) : (
    <>
      <b>{member.name}</b>, {mMeta?.label.toLowerCase()}, {row?.date}
    </>
  );

  const valueOf = (k: MetricKey) => `${row?.[k] ?? 'none'} ${crew.metrics[k].unit}`;
  const segs: { k: ReadingKey | null; title: string; sub: string; st: Status | null }[] = [
    {
      k: flagged,
      title: 'Flagged',
      sub: flagged ? crew.metrics[flagged].label : 'None today',
      st: flagged ? todayScores.find((s) => s.metric === flagged)?.status ?? null : null,
    },
    { k: heartKey, title: 'Heart rate', sub: valueOf(heartKey), st: todayScores.find((s) => s.metric === heartKey)?.status ?? null },
    { k: doseKey, title: 'Dose', sub: valueOf(doseKey), st: todayScores.find((s) => s.metric === doseKey)?.status ?? null },
    { k: 'storm', title: 'Storm', sub: `${event.flare_class}, ${ALERT_LABEL[event.alert_level].toLowerCase()}`, st: alertStatus(event) },
  ];
  const activeSeg = segs.findIndex((s) => s.k === key);
  const credits = [`Space weather data: ${storm.meta.data_credit}`, `Model: ${storm.meta.model}`, ANATOMY_CREDIT];

  const nameFs = lay.narrow ? 15 : 18;
  const textW = (s: string, fs: number) => s.length * fs * 0.54;
  const layerRows = GRAPH.nodes.filter((n) => String(n.layer) === layer);
  const few = (ids: string[], max: number) => ({ list: ids.slice(0, max), more: Math.max(0, ids.length - max) });
  const fromFew = few(from, 3);
  const toFew = few(to, 3);
  const last = atSafe === path.length - 1;

  return (
    <div className="fr" onPointerDown={touch} onKeyDown={touch}>
      {/* ------------------------------------------------------------ top bar */}
      <header className="fr-top">
        <div className="fr-brand">
          <span>e^x</span>
          <span className="fr-mono">Flight Record</span>
        </div>
        <div className="fr-legend" aria-label="Legend">
          {(Object.keys(STATUS_WORD) as NodeStatus[]).map((s) => (
            <span key={s} title={GRAPH.meta.status_legend[s]}>
              <Swatch status={s} />
              {STATUS_WORD[s]}
            </span>
          ))}
          <span className="own">
            <i>T</i>Tomas<i>E</i>Emile<i>X</i>External
          </span>
        </div>
        <div className="fr-clock">
          <span className="fr-label">Record to</span>
          <span className="fr-mono">
            Day {todayIdx + 1} of {replay.dates.length}, {replay.dates[todayIdx]}
          </span>
        </div>
      </header>

      {/* ----------------------------------------------------------- headline */}
      <section className="fr-head">
        <div className="fr-headline">
          <div className="fr-index">
            04<small>/04</small>
            <em className="fr-label">Record</em>
          </div>
          <h1 className="fr-h1">The life of one reading.</h1>
          <p className="fr-sub">{subline}</p>
        </div>
        <div className="fr-body">
          <Figure height={196} regions={regions} active={region} tone={status} onPick={pickRegion} />
        </div>
        <div className="fr-hero">
          <div className="fr-label">{isStorm ? 'Storm probability' : mMeta?.label}</div>
          <div className="fr-hero-num">
            {isStorm ? event.p_storm.toFixed(3) : value ?? 'none'}
            <span>{isStorm ? `within ${storm.meta.horizon_hours} h` : mMeta?.unit}</span>
          </div>
          <div className="fr-hero-status">
            <Shape status={status} size={16} />
            <b>{isStorm ? ALERT_LABEL[event.alert_level] : STATUS_LABEL[status]}</b>
            {!isStorm && score?.z != null && <span>z {score.z.toFixed(2)}</span>}
            {isStorm && event.actual_storm && <span>particles arrived</span>}
          </div>
        </div>
        <Strip {...strip} tone={status} />
      </section>

      {/* -------------------------------------------------------------- trace */}
      <section className="fr-stage" ref={stageRef}>
        {showIndex ? (
          <div className="fr-table">
            <div className="fr-layers" role="tablist" aria-label="Layer">
              {Object.entries(LAYERS).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={id === layer} onClick={() => setLayer(id)}>
                  <span className="fr-mono">
                    0{Number(id) + 1} · {GRAPH.nodes.filter((n) => String(n.layer) === id).length}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="fr-rows">
              {layerRows.map((n) => (
                <button key={n.id} aria-pressed={n.id === noteId} onClick={() => select(n.id)}>
                  <Swatch status={n.status} w={30} />
                  <span className="n">{n.label}</span>
                  <span className="k">
                    {STATUS_WORD[n.status]} · {n.owner === 'external' ? 'External' : n.owner}
                  </span>
                  <span className="fr-mono r">{counts[n.id] ? `${fmt(counts[n.id].n)} ${counts[n.id].unit}` : ''}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <svg width={lay.w} height={lay.h} role="group" aria-label="Data lineage trace">
            <defs>
              <marker id="fr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                <path d="M1 1.5 8.5 5 1 8.5" fill="none" stroke="var(--paper)" strokeWidth="1.6" />
              </marker>
            </defs>

            {/* rules */}
            {lay.segs.map((s, i) => (
              <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} {...lineOf(s.status, segOn(s.ends))} />
            ))}

            {/* stems: one per branch, to the station it feeds, with a direction tick */}
            {lay.stems.map((s) => {
              const on = s.branch === forced;
              const st = lineOf(s.status, on);
              return (
                <g key={s.branch}>
                  <polyline points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" {...st} />
                  <path
                    d="M-5 -5 1 0 -5 5"
                    transform={`translate(${s.tick.x} ${s.tick.y}) rotate(${s.tick.deg})`}
                    fill="none"
                    stroke={on ? 'var(--paper)' : 'var(--paper-2)'}
                    strokeWidth={1.75}
                  />
                </g>
              );
            })}

            {/* packets: one per crew member per mission day, or one per flare */}
            {[tick - 2, tick - 1, tick].flatMap((n) =>
              (isStorm ? [0] : crew.crew.map((_, ci) => ci)).map((ci) => {
                const st = packetStatus(n, ci);
                const fill = st === 'green' ? 'var(--paper-2)' : TONE[st];
                return (
                  <g key={`${key}-${n}-${ci}`} className="fr-pkt" style={{ offsetPath: `path('${trace.d}')`, animationDelay: `${ci * 260}ms` }}>
                    <rect x={-16} y={-1} width={16} height={2} fill={fill} opacity={0.45} />
                    <circle r={3} fill={fill} />
                  </g>
                );
              }),
            )}

            {/* branches */}
            {BRANCHES.map((b) => {
              if (!lay.shown.has(b.id)) return null;
              const t = lay.title[b.id];
              const isOpen = lay.open.has(b.id);
              const up = b.side === 'up';
              const mix = [...new Set(b.nodes.map((id) => NODE[id].status))];
              const hitW = Math.max(72, Math.min(lay.step * 2 - 12, 320));
              return (
                <g key={b.id}>
                  <rect className="fr-hit" x={t.x - 20} y={t.y - 36} width={hitW} height={72} onClick={() => toggleBranch(b.id)}>
                    <title>
                      {isOpen ? 'Fold' : 'Open'} {b.title}
                    </title>
                  </rect>
                  <g pointerEvents="none">
                    <rect x={t.x - 5} y={t.y - 5} width={10} height={10} fill={isOpen ? 'var(--paper)' : 'var(--ink-0)'} stroke="var(--paper)" strokeWidth={1.25} />
                    <text x={t.x + 16} y={t.y + 5} className={`t-title ${isOpen ? 'on' : ''}`}>
                      {b.title}
                      <tspan className="t-mono" dx={8}>
                        {b.nodes.length}
                      </tspan>
                    </text>
                    {!isOpen && (
                      <text x={t.x + 16} y={t.y + (up ? -17 : 25)} className="t-mono off">
                        {[b.sub, ...mix.map((s) => STATUS_WORD[s].toLowerCase())].filter(Boolean).join(', ')}
                      </text>
                    )}
                    {isOpen && <line x1={t.x + 16} x2={t.x + 16 + textW(b.title, 15) * 1.12} y1={t.y + 12} y2={t.y + 12} stroke="var(--paper)" strokeWidth={2} />}
                  </g>
                  {isOpen &&
                    b.nodes.map((id, k) => {
                      const n = NODE[id];
                      const p = lay.pos[id];
                      const on = pathSet.has(id);
                      const chosen = id === noteId;
                      const cls = chosen || on || also.has(id) ? 'on' : '';
                      const tail = [on ? pathNo(id) : '', STATUS_SHORT[n.status], ownerMark(n.owner)].filter(Boolean).join(' ');
                      const ny = p.y + (up ? -20 : 32);
                      const fs = lay.narrow ? 14 : 16;
                      // Rail stations share the spine pitch, so long names shorten the same way.
                      const maxCh = Math.floor((lay.step - 10) / (fs * 0.54));
                      const label = n.label.length > maxCh ? `${n.label.slice(0, maxCh - 1)}…` : n.label;
                      return (
                        <g key={id} className="fr-leaf" style={{ animationDelay: `${k * 40}ms` }}>
                          <rect className="fr-hit" x={p.x - lay.step / 2} y={up ? p.y - 62 : p.y - 26} width={lay.step} height={88} onClick={() => select(id)}>
                            <title>{n.label}</title>
                          </rect>
                          <g pointerEvents="none">
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={on ? 7 : 6}
                              fill={chosen || (on && path[atSafe] === id) ? 'var(--paper)' : 'var(--ink-0)'}
                              stroke={on || chosen ? 'var(--paper)' : 'var(--paper-2)'}
                              strokeWidth={on || chosen ? 2 : 1.25}
                              strokeDasharray={n.status === 'planned' ? '2 3' : undefined}
                            />
                            <text x={p.x} y={ny} textAnchor="middle" className={`t-leaf ${cls}`} style={{ fontSize: fs }}>
                              {label}
                            </text>
                            <text x={p.x} y={ny + (up ? -20 : 20)} textAnchor="middle" className="t-mono">
                              {tail}
                            </text>
                            {chosen && <line x1={p.x - textW(label, fs) / 2} x2={p.x + textW(label, fs) / 2} y1={ny + 6} y2={ny + 6} stroke="var(--paper)" strokeWidth={2} />}
                          </g>
                        </g>
                      );
                    })}
                </g>
              );
            })}

            {/* spine stations */}
            {SPINE.map((id, i) => {
              const n = NODE[id];
              const p = lay.pos[id];
              const on = pathSet.has(id);
              const chosen = id === noteId;
              const here = on && path[atSafe] === id;
              const c = counts[id];
              const ny = p.y + (lay.narrow ? 52 + (i % 2) * 20 : 56);
              const isConsole = id === 'sf_console';
              return (
                <g key={id}>
                  <rect className="fr-hit" x={p.x - lay.step / 2} y={p.y - 14} width={lay.step} height={100} onClick={() => select(id)}>
                    <title>{n.label}</title>
                  </rect>
                  <g pointerEvents="none">
                    {isConsole ? (
                      <>
                        <circle cx={p.x} cy={p.y} r={24} fill="var(--ink-0)" stroke={on ? 'var(--paper)' : 'var(--paper-2)'} strokeWidth={on ? 2 : 1.25} />
                        <Figure mini height={38} x={p.x - 6.6} y={p.y - 19} regions={regions} active={region} tone={status} />
                      </>
                    ) : (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={10}
                        fill={chosen || here ? 'var(--paper)' : 'var(--ink-0)'}
                        stroke={on ? 'var(--paper)' : 'var(--paper-2)'}
                        strokeWidth={on ? 2 : 1.25}
                      />
                    )}
                    <text x={p.x} y={p.y + (isConsole ? 40 : 32)} textAnchor="middle" className={`t-mono ${on ? '' : 'off'}`}>
                      {[on ? pathNo(id) : '', STATUS_SHORT[n.status], ownerMark(n.owner)].filter(Boolean).join(' ')}
                    </text>
                    <text x={p.x} y={ny + (isConsole ? 6 : 0)} textAnchor="middle" className={`t-name ${chosen || on ? 'on' : 'off'}`} style={{ fontSize: nameFs }}>
                      {n.label}
                    </text>
                    {chosen && (
                      <line
                        x1={p.x - textW(n.label, nameFs) / 2}
                        x2={p.x + textW(n.label, nameFs) / 2}
                        y1={ny + (isConsole ? 13 : 7)}
                        y2={ny + (isConsole ? 13 : 7)}
                        stroke="var(--paper)"
                        strokeWidth={2}
                      />
                    )}
                    {c && !lay.narrow && !isConsole && (
                      <text x={p.x} y={p.y + 80} textAnchor="middle" className={`t-mono ${on ? '' : 'off'}`}>
                        {fmt(c.n)} {c.unit}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}

            {/* the selected station's real edges, from the graph */}
            {links.map((l) => (
              <path key={l.k} className="fr-link" d={l.d} fill="none" stroke="var(--paper)" strokeWidth={2} markerEnd="url(#fr-arrow)" pointerEvents="none" />
            ))}

            {/* the reading itself */}
            <g
              className="fr-marker"
              data-status={status}
              pointerEvents="none"
              style={{ offsetPath: `path('${trace.d}')`, offsetDistance: `${trace.stops[atSafe]}px`, transitionDuration: `${moveMs}ms` }}
            >
              <circle className="ring" r={path[atSafe] === 'sf_console' ? 30 : 17} stroke={TONE[status]} />
              {path[atSafe] !== 'sf_console' && <circle r={5.5} fill={TONE[status]} />}
            </g>
          </svg>
        )}
      </section>

      {/* ---------------------------------------------------------------- note */}
      <section className="fr-note" key={noteId}>
        <div className="who">
          <div className="fr-mono id">
            {pathSet.has(noteId) ? `${pathNo(noteId)} / ${String(path.length).padStart(2, '0')}` : 'Off this trace'} · {node.id}
          </div>
          <h2>{node.label}</h2>
          <div className="facts">
            <Swatch status={node.status} />
            <b>{STATUS_WORD[node.status]}</b>
            <span>{node.kind}</span>
            <span>{node.owner === 'external' ? 'External' : node.owner}</span>
          </div>
          <div className="facts">
            <span>{LAYERS[String(node.layer)]}</span>
            {noteCount && (
              <b>
                {fmt(noteCount.n)} {noteCount.unit}
              </b>
            )}
          </div>
        </div>

        <div className="what">
          {noteId === 'sf_console' && !isStorm ? (
            <div className="console">
              <Figure mini height={84} regions={regions} active={region} tone={status} />
              <p className="sample">{noteSample}</p>
            </div>
          ) : (
            noteSample && <p className="sample">{noteSample}</p>
          )}
          <p className="src">{node.source}</p>
        </div>

        <dl className="flow">
          <dt className="fr-label">From</dt>
          <dd className={from.length ? '' : 'dim'}>
            {from.length
              ? fromFew.list.map((id) => (
                  <button key={id} onClick={() => select(id)}>
                    {NODE[id].label}
                  </button>
                ))
              : 'Start of the record'}
            {fromFew.more > 0 && <span className="more">+{fromFew.more}</span>}
          </dd>
          <dt className="fr-label">To</dt>
          <dd className={to.length ? '' : 'dim'}>
            {to.length
              ? toFew.list.map((id) => (
                  <button key={id} onClick={() => select(id)}>
                    {NODE[id].label}
                  </button>
                ))
              : 'End of the record'}
            {toFew.more > 0 && <span className="more">+{toFew.more}</span>}
          </dd>
          <dt className="fr-label">Carries</dt>
          <dd className="fr-mono carries">
            {[...node.fields, ...(node.maps_to ?? [])].slice(0, 6).map((f, i) => (
              <span key={`${f}${i}`}>{f in crew.metrics ? <button onClick={() => follow(f as MetricKey)}>{f}</button> : f}</span>
            ))}
          </dd>
        </dl>

        <dl className="meta">
          <dt className="fr-label">Cadence</dt>
          <dd>{node.cadence}</dd>
          <dt className="fr-label">Licence</dt>
          <dd className="dim">
            {node.license ?? 'None stated'}
            {node.url && (
              <>
                {' · '}
                <a href={node.url} target="_blank" rel="noreferrer">
                  {new URL(node.url).hostname}
                </a>
              </>
            )}
          </dd>
          <dt className="fr-label">Ref</dt>
          <dd className="fr-mono dim">{node.samples?.[0] ?? node.path ?? node.impl ?? node.ref[0]}</dd>
        </dl>
      </section>

      {/* ----------------------------------------------------------------- bar */}
      <nav className="fr-bar" aria-label="Controls">
        <button className="sq" onClick={() => stepBy(-1)} disabled={atSafe === 0} aria-label="Previous station">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12.5 4 6.5 10l6 6" />
          </svg>
          Prev
        </button>
        <div className="grp crew" role="group" aria-label="Crew">
          {crew.crew.map((c, ci) => {
            const st = regionStatus(replay.scores[ci][todayIdx] ?? [], crew.metrics).overall;
            const [rank, ...rest] = c.name.split(' ');
            const titled = rank.endsWith('.') && rest.length > 0;
            return (
              <button key={c.id} aria-pressed={c.id === member.id} onClick={() => pickCrew(c.id)}>
                <span className="seg-title">
                  <Shape status={st} size={14} />
                  {titled ? rest.join(' ') : c.name}
                </span>
                <span className="seg-sub">{c.role}</span>
              </button>
            );
          })}
        </div>
        <div className="grp" role="group" aria-label="Reading">
          {segs.map((s, i) => (
            <button key={s.title} aria-pressed={i === activeSeg} disabled={s.k === null} onClick={() => s.k && follow(s.k)}>
              <span className="seg-title">
                {s.st && <Shape status={s.st} size={14} />}
                {s.title}
              </span>
              <span className="seg-sub">{s.sub}</span>
            </button>
          ))}
        </div>
        <button className="sq" aria-pressed={showIndex} onClick={() => setShowIndex(!showIndex)} aria-label={`All ${GRAPH.nodes.length} nodes`}>
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h14M3 10h14M3 15h14" />
          </svg>
          All {GRAPH.nodes.length}
        </button>
        <button
          className="sq"
          aria-pressed={auto}
          onPointerDown={(e) => {
            touched.current = true;
            e.stopPropagation();
          }}
          onClick={() => {
            touched.current = true;
            setShowIndex(false);
            setAuto(!auto);
          }}
        >
          <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {auto ? <path d="M7 4v12M13 4v12" /> : <path d="M6 4l10 6-10 6Z" />}
          </svg>
          {auto ? 'Hold' : 'Play'}
        </button>
        <button className="sq next" onClick={() => (last ? (setSel(null), setMoveMs(0), setAt(0)) : stepBy(1))} aria-label={last ? 'Back to the source' : 'Next station'}>
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
            {last ? <path d="M15 10H5M9 5.5 4.5 10 9 14.5" /> : <path d="M7.5 4l6 6-6 6" />}
          </svg>
          {last ? 'Start' : 'Next'}
        </button>
        <div className="fr-progress" style={{ transform: `scaleX(${path.length > 1 ? atSafe / (path.length - 1) : 0})` }} />
      </nav>

      <footer className="fr-foot">
        <p>
          {DISCLAIMERS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </p>
        <p>
          {credits.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </p>
      </footer>
    </div>
  );
}
