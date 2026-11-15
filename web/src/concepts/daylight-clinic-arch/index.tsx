// Daylight Clinic, data architecture map.
// An orbital map of docs/lineage.json: e^x (bus and scoring core) in the centre,
// five hairline rings out to the outside world. Grid: rail, map, sheet; one bar below. Packets are real events: the
// replay walks crew_data.json day by day through core/scoring and places the
// flares of storm_forecast.json on the same clock.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Footer } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { dayIndex, statusOn, type MetricScore } from '../../core/scoring';
import { toFhir } from '../../core/observation';
import type { ConceptMeta } from '../../registry';
import type { CrewMember, MetricKey, MissionData, Status } from '../../data/types';
import {
  EDGES,
  LINEAGE,
  NODES,
  NODE_BY_ID,
  ORDERED,
  PLACED,
  RADII,
  RING_NAMES,
  ROUTES,
  edgeStage,
  inStage,
  metricTrace,
  neighbourhood,
  polar,
  ringNodes,
  sectorOf,
  type LNode,
  type LStatus,
} from './graph';
import { createReplay, type Journey, type Tone } from './replay';
import { CREW_WORD, KIND_WHAT, KindIcon, LineSwatch, STATUS_WORD, StatusShape } from './parts';
import { placeLabels, type LabelLine, type LabelReq } from './labels';
import './daylight.css';

export const meta: ConceptMeta = {
  title: 'Daylight Clinic: Data system',
  direction: 'Daylight Clinic',
  surface: 'architecture',
};

type Sel = { t: 'node'; id: string } | { t: 'ring'; ring: number } | { t: 'metric'; key: MetricKey } | null;
type SectorFilter = 'all' | 'crew' | 'storm';
type Stage = 'build' | 'runtime';

const TICK_MS = 1400;
const POOL = 140;
const STATUSES: LStatus[] = ['live', 'simulated', 'offline-sample', 'planned'];
const OWNERS = [...new Set(NODES.map((n) => n.owner))].sort((a, b) => (a === 'external' ? 1 : b === 'external' ? -1 : a.localeCompare(b)));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const shortLabel = (s: string) => s.replace(/\s*\(.*?\)/g, '');
const num = (n: number) => n.toLocaleString('en-US');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => !w.endsWith('.'))
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** One or two short lines for a node label on the map. */
function wrapLabel(label: string): string[] {
  const tokens = label.split(/\s+|(?<=_)/);
  const lines: string[] = [];
  for (const t of tokens) {
    const sep = lines.length && !lines[lines.length - 1].endsWith('_') ? ' ' : '';
    if (lines.length && (lines[lines.length - 1] + sep + t).length <= 12) lines[lines.length - 1] += sep + t;
    else lines.push(t);
  }
  if (lines.length > 2) {
    const rest = lines.slice(1).reduce((a, t) => a + (a.endsWith('_') ? '' : ' ') + t);
    return [lines[0], rest.length > 13 ? `${rest.slice(0, 12)}…` : rest];
  }
  return lines;
}

// Read once when the concept loads: the page rewrites the query string as the selection changes.
const Q0 = new URLSearchParams(window.location.search);
const params = () => Q0;
function initialSel(): Sel {
  const q = params();
  const node = q.get('node');
  if (node && NODE_BY_ID[node]) return { t: 'node', id: node };
  const ring = Number(q.get('ring'));
  if (q.get('ring') && ring >= 1 && ring <= 5) return { t: 'ring', ring };
  const metric = q.get('metric');
  if (metric) return { t: 'metric', key: metric as MetricKey };
  return null;
}

/** A real value for a node, read from the loaded data files or the core. */
function sampleFor(
  n: LNode,
  data: MissionData,
  member: CrewMember,
  scores: MetricScore[],
  busCount: (k: 'observation' | 'flag' | 'alert' | 'report') => number,
  envLabel: string,
): [string, string][] {
  const m = data.crew.metrics;
  const i = dayIndex(member, data.crew.mission.today);
  const row = member.series[i >= 0 ? i : member.series.length - 1];
  const val = (k: MetricKey) => (row?.[k] == null ? 'not measured' : `${row[k]} ${m[k].unit}`);
  const keys = [...new Set([...n.fields, ...(n.maps_to ?? [])])].filter((k): k is MetricKey => k in m);
  const storm = data.storm;

  if (['ds_storm_forecast', 'ml_export', 'core_radiation', 'sf_radiation'].includes(n.id)) {
    const e = storm.events.reduce((a, b) => (b.peak_time > a.peak_time ? b : a), storm.events[0]);
    if (!e) return [];
    return [
      ['Flare', e.flare_class],
      ['p_storm', String(e.p_storm)],
      ['Alert', e.alert_level],
      ['Peak', e.peak_time],
    ];
  }
  if (n.id === 'ml_model_v1') {
    return [
      ['Model', storm.meta.model],
      ['Horizon', `${storm.meta.horizon_hours} h`],
      ['Watch at', storm.meta.thresholds.watch.toFixed(3)],
      ['Warning at', storm.meta.thresholds.warning.toFixed(3)],
    ];
  }
  if (['api_donki', 'ml_fetch_donki', 'ml_prepare'].includes(n.id)) {
    return [
      ['Credit', storm.meta.data_credit],
      ['Flares scored', num(storm.events.length)],
      ['Test period', storm.meta.test_period.join(' to ')],
    ];
  }
  if (['ds_real_crew', 'ml_real_crew', 'ds_osd575'].includes(n.id)) {
    if (!data.real) return [];
    const f = data.real.flags[0];
    return [
      ['Mission', data.real.meta.mission],
      ...(f ? ([[`${f.crew} ${f.timepoint}`, `${f.analyte} ${f.value} ${f.unit}`]] as [string, string][]) : []),
      ['Draws flagged', num(data.real.flags.length)],
    ];
  }
  if (n.id === 'core_observation') {
    const k = (Object.keys(m) as MetricKey[])[0];
    const fhir = toFhir({ subject: member.id, metric: k, value: row?.[k] ?? null, unit: m[k].unit, time: row.date, source: 'replay:crew_data.json' });
    return [['FHIR', JSON.stringify(fhir)]];
  }
  if (['core_scoring', 'ml_crew_flags', 'core_escalation', 'core_handoff', 'person_cmo'].includes(n.id)) {
    const rank = { green: 0, amber: 1, red: 2 };
    const w = scores.reduce<MetricScore | null>((a, s) => (!a || rank[s.status] > rank[a.status] ? s : a), null);
    if (!w) return [];
    return [
      ['Metric', shortLabel(m[w.metric].label)],
      ['Value', `${w.value} ${m[w.metric].unit}`],
      ['3-day z', w.z === null ? 'absolute band' : w.z.toFixed(2)],
      ['Status', CREW_WORD[w.status]],
    ];
  }
  if (n.id === 'core_bus' || n.id === 'sf_systems') {
    return [
      ['Observations', num(busCount('observation'))],
      ['Flags', num(busCount('flag'))],
      ['Alerts', num(busCount('alert'))],
      ['Reports', num(busCount('report'))],
    ];
  }
  if (['core_link', 'sf_ground', 'person_surgeon'].includes(n.id)) {
    return [
      ['Environment', envLabel],
      ['Reports', `${num(busCount('report'))}, simulated`],
      ['Link delay', 'Not modelled here'],
    ];
  }
  if (n.id === 'ds_published_ranges') {
    return (Object.keys(member.baseline) as MetricKey[]).slice(0, 4).map((k) => {
      const b = member.baseline[k];
      return [shortLabel(m[k].label), b ? `${b.mean} ± ${b.sd} ${m[k].unit}` : ''] as [string, string];
    });
  }
  if (keys.length) return keys.slice(0, 4).map((k) => [shortLabel(m[k].label), val(k)] as [string, string]);
  if (n.samples?.length) return n.samples.slice(0, 3).map((s, j) => [`File ${j + 1}`, s.split('/').pop() ?? s] as [string, string]);
  return [];
}

export default function DaylightClinicArch() {
  const { data, loadState, error } = useMissionData();
  const crew = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);

  const [sel, setSel] = useState<Sel>(initialSel);
  const [sector, setSector] = useState<SectorFilter>(() => (params().get('sector') as SectorFilter) || 'all');
  const [stage, setStage] = useState<Stage>(() => (params().get('stage') === 'build' ? 'build' : 'runtime'));
  const [owner, setOwner] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [, setVersion] = useState(0);
  const [size, setSize] = useState({ w: 1280, h: 900 });

  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const mapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const packets = useRef<{ route: number; t0: number; dur: number; tone: Tone; still?: boolean }[]>([]);
  const clock = useRef(0);
  const dayRef = useRef(0);

  const crewParam = useRef(params().get('crew'));
  useEffect(() => {
    const q = crewParam.current;
    if (q && data?.crew.crew.some((c) => c.id === q)) setCrew(q);
  }, [data, setCrew]);

  // The map owns its own grid cell; it is measured, never assumed.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loadState]);

  const replay = useMemo(() => (data && environment ? createReplay(data, environment) : null), [data, environment]);

  const jump = useCallback(
    (d: number) => {
      if (!replay) return;
      const to = Math.max(0, Math.min(replay.dates.length - 1, d));
      replay.reset();
      for (let i = 0; i <= to; i++) replay.step(i);
      packets.current = [];
      dayRef.current = to;
      setDay(to);
      setVersion((v) => v + 1);
    },
    [replay],
  );

  // Start two weeks before mission.today so the flagged days pass while watching.
  useEffect(() => {
    if (!replay) return;
    const q = params().get('day');
    jump(q !== null ? Number(q) - 1 : replay.dates.length - 15);
  }, [replay, jump]);

  const schedule = useCallback(
    (journeys: Journey[]) => {
      const ends = new Map<number, number>();
      for (const j of journeys) {
        let t = j.after >= 0 ? (ends.get(j.after) ?? clock.current) : clock.current;
        for (const e of j.hops) {
          // 1.2 to 2.4 s per hop, by drawn length only. Link delay is not modelled on this map.
          const dur = Math.max(1200, Math.min(2400, (ROUTES[e].len / 200) * 1000));
          if (reduced) packets.current.push({ route: e, t0: clock.current, dur: TICK_MS, tone: j.tone, still: true });
          else packets.current.push({ route: e, t0: t, dur, tone: j.tone });
          t += dur;
          ends.set(e, t);
        }
      }
    },
    [reduced],
  );

  // One animation loop: advances the replay clock and moves the packets.
  const stageNow = useRef(stage);
  stageNow.current = stage;
  const playingNow = useRef(playing);
  playingNow.current = playing;
  useEffect(() => {
    if (!replay) return;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    let buildAcc = 0;
    let buildIdx = 0;
    const buildEdges = EDGES.map((e, i) => (edgeStage(e) === 'build' && !e.relation && e.status !== 'planned' ? i : -1)).filter((i) => i >= 0);
    const frame = (now: number) => {
      const dt = Math.min(100, now - prev);
      prev = now;
      clock.current += dt;
      if (stageNow.current !== 'build' && playingNow.current) {
        acc += dt;
        if (acc >= TICK_MS) {
          acc = 0;
          const next = dayRef.current + 1;
          if (next >= replay.dates.length) setPlaying(false);
          else {
            schedule(replay.step(next));
            dayRef.current = next;
            setDay(next);
          }
        }
      } else if (stageNow.current === 'build' && !reduced) {
        // Build time has no clock in the data: neutral packets walk the pipeline edges in file order.
        buildAcc += dt;
        if (buildAcc >= 300 && buildEdges.length) {
          buildAcc = 0;
          const e = buildEdges[buildIdx++ % buildEdges.length];
          packets.current.push({ route: e, t0: clock.current, dur: Math.max(1200, Math.min(2400, ROUTES[e].len * 5)), tone: 'neutral' });
        }
      }
      const t = clock.current;
      packets.current = packets.current.filter((p) => t < p.t0 + p.dur);
      const list = packets.current;
      let k = 0;
      for (let i = 0; i < list.length && k < POOL; i++) {
        const p = list[i];
        if (t < p.t0) continue;
        const el = dots.current[k++];
        if (!el) continue;
        const pos = ROUTES[p.route].at(p.still ? 0.5 : (t - p.t0) / p.dur);
        el.setAttribute('cx', pos.x.toFixed(1));
        el.setAttribute('cy', pos.y.toFixed(1));
        el.setAttribute('class', `dca-packet t-${p.tone}`);
        el.style.display = '';
      }
      for (; k < POOL; k++) {
        const el = dots.current[k];
        if (el && el.style.display !== 'none') el.style.display = 'none';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [replay, schedule, reduced]);

  useEffect(() => {
    packets.current = [];
  }, [stage]);

  // Selection lives in the URL so the body surface can link straight to a node or metric.
  const selKey = sel ? `${sel.t}:${sel.t === 'node' ? sel.id : sel.t === 'ring' ? sel.ring : sel.key}` : '';
  useEffect(() => {
    const q = new URLSearchParams();
    if (sel?.t === 'node') q.set('node', sel.id);
    if (sel?.t === 'ring') q.set('ring', String(sel.ring));
    if (sel?.t === 'metric') q.set('metric', sel.key);
    if (crew) q.set('crew', crew.id);
    if (stage === 'build') q.set('stage', 'build');
    window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`);
  }, [sel, crew, stage]);

  // Focus goes into the sheet when it opens and back to where it came from when it closes.
  useEffect(() => {
    setMore(false);
    const active = document.activeElement as HTMLElement | null;
    if (selKey) {
      if (!sheetRef.current?.contains(active)) {
        if (active && active !== document.body) returnRef.current = active;
        headRef.current?.focus({ preventScroll: true });
      }
    } else if (returnRef.current) {
      if (returnRef.current.isConnected) returnRef.current.focus({ preventScroll: true });
      returnRef.current = null;
    }
  }, [selKey]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const metricKeys = useMemo(() => (data ? (Object.keys(data.crew.metrics) as MetricKey[]) : []), [data]);
  // Short row names; when two metrics share a name, the bracketed part tells them apart.
  const rowName = useMemo(() => {
    const out: Record<string, string> = {};
    if (!data) return out;
    const short = metricKeys.map((k) => shortLabel(data.crew.metrics[k].label));
    metricKeys.forEach((k, i) => {
      const twin = short.indexOf(short[i]) !== short.lastIndexOf(short[i]);
      const paren = /\((.*?)\)/.exec(data.crew.metrics[k].label)?.[1];
      out[k] = twin && paren ? `${cap(short[i].split(' ').pop() ?? '')}, ${paren}` : short[i];
    });
    return out;
  }, [data, metricKeys]);

  const focus = useMemo(() => {
    if (!sel) return null;
    if (sel.t === 'node') {
      const { up, down } = neighbourhood(sel.id);
      return { nodes: new Set([sel.id, ...up.nodes, ...down.nodes]), up: up.edges, down: down.edges, upNodes: up.nodes, downNodes: down.nodes };
    }
    if (sel.t === 'ring') {
      return { nodes: new Set(ringNodes(sel.ring).map((n) => n.id)), up: new Set<number>(), down: new Set<number>(), upNodes: new Set<string>(), downNodes: new Set<string>() };
    }
    const tr = metricTrace(sel.key, metricKeys, sel.key.startsWith('dose'));
    return { nodes: tr.nodes, up: tr.edges, down: new Set<number>(), upNodes: tr.nodes, downNodes: new Set<string>() };
  }, [sel, metricKeys]);

  if (loadState === 'error') return <p style={{ padding: 32 }}>{error}</p>;
  if (!data || !crew || !environment || !replay) return <div className="dca-root" />;

  const file = data.crew;
  const today = statusOn(crew, file, file.mission.today, environment);
  const scoreOf = (k: MetricKey) => today.scores.find((s) => s.metric === k);
  const open = sel !== null;
  const selNode = sel?.t === 'node' ? NODE_BY_ID[sel.id] : null;
  const build = stage === 'build';
  const lastDay = replay.dates.length - 1;

  // Flagged metrics come first, then file order.
  const RANK: Record<Status, number> = { red: 0, amber: 1, green: 2 };
  const railKeys = [...metricKeys].sort((a, b) => RANK[scoreOf(a)?.status ?? 'green'] - RANK[scoreOf(b)?.status ?? 'green']);

  // Camera: the map is centred in its own cell and never turns, so Crew stays up and Storm stays down.
  const scale = Math.max(0.42, Math.min(1.15, (size.h - 16) / 1010, (size.w - 16) / 970));
  const cx = size.w / 2;
  const cy = size.h / 2 - 4;
  const fs = 14 / scale;
  const hitR = Math.min(36 / scale, 44);

  const dim = (id: string) =>
    (focus !== null && !focus.nodes.has(id)) ||
    (sector !== 'all' && sectorOf(id) !== sector && sectorOf(id) !== 'both') ||
    (build && id !== 'core_bus' && !inStage(id, 'build')) ||
    (owner !== null && NODE_BY_ID[id].owner !== owner);

  const pick = (id: string) => setSel((s) => (s?.t === 'node' && s.id === id ? null : { t: 'node', id }));
  const count = (id: string): number => {
    if (!build) return replay.counts.get(id) ?? 0;
    // Build time: record counts read from the files themselves.
    if (id === 'ds_crew_data') return file.crew.reduce((a, c) => a + c.series.length, 0);
    if (id === 'ds_storm_forecast') return data.storm.events.length;
    if (id === 'ds_real_crew') return data.real ? data.real.crew.reduce((a, c) => a + c.series.length, 0) : 0;
    return 0;
  };
  const busCount = (k: 'observation' | 'flag' | 'alert' | 'report') => replay.bus.count(k);
  const envLabel = file.environments[environment].label;

  const neighbour = (dir: 1 | -1): { label: string; go: () => void } | null => {
    if (sel?.t === 'node') {
      const i = ORDERED.findIndex((n) => n.id === sel.id);
      const n = ORDERED[(i + dir + ORDERED.length) % ORDERED.length];
      return { label: n.label, go: () => setSel({ t: 'node', id: n.id }) };
    }
    if (sel?.t === 'ring') {
      const ring = ((sel.ring - 1 + dir + 5) % 5) + 1;
      return { label: RING_NAMES[ring], go: () => setSel({ t: 'ring', ring }) };
    }
    if (sel?.t === 'metric') {
      const i = railKeys.indexOf(sel.key);
      const key = railKeys[(i + dir + railKeys.length) % railKeys.length];
      return { label: rowName[key], go: () => setSel({ t: 'metric', key }) };
    }
    return null;
  };

  const names = (ids: Iterable<string>) =>
    [...ids].map((id) => NODE_BY_ID[id]).sort((a, b) => a.layer - b.layer || PLACED[a.id].ring - PLACED[b.id].ring);

  const linkRows = (list: LNode[], limit: number) => {
    const shown = more ? list : list.slice(0, limit);
    return (
      <>
        {shown.map((u) => (
          <button key={u.id} className="dca-linkrow dca-press" onClick={() => pick(u.id)}>
            <LineSwatch status={u.status} />
            <span className="grow">{u.label}</span>
            <span className="st">{STATUS_WORD[u.status]}</span>
          </button>
        ))}
        {list.length > shown.length && (
          <button className="dca-linkrow dca-press is-more" onClick={() => setMore(true)}>
            +{list.length - shown.length} more
          </button>
        )}
      </>
    );
  };

  const closeBtn = (
    <button className="dca-sq dca-press" onClick={() => setSel(null)}>
      Close
    </button>
  );

  /* ------------------------------------------------------------- sheet */
  let sheet: JSX.Element | null = null;
  let callout: { id: string; lines: LabelLine[] } | null = null;
  if (selNode) {
    const n = selNode;
    const c = count(n.id);
    const sample = sampleFor(n, data, crew, today.scores, busCount, envLabel);
    const files = [n.path, n.impl, ...(n.samples ?? [])].filter(Boolean) as string[];
    const up = names(focus?.upNodes ?? []);
    const down = names(focus?.downNodes ?? []);
    const ring = Math.max(1, PLACED[n.id].ring);
    const first = sample.find(([, v]) => v.length <= 18);
    callout = {
      id: n.id,
      lines: [
        { t: n.label, k: 'strong' },
        { t: STATUS_WORD[n.status], k: 'sub' },
        ...(first ? [{ t: `${first[0]} ${first[1]}`, k: 'sub' as const }] : []),
      ],
    };
    sheet = (
      <>
        <div className="dca-sheet-head">
          <div className="txt">
            <p className="dca-mono">{cap(n.kind)}</p>
            <h2 ref={headRef} tabIndex={-1}>
              {n.label}
            </h2>
            <p className="dca-statusline">
              <LineSwatch status={n.status} />
              {STATUS_WORD[n.status]}
            </p>
          </div>
          {closeBtn}
        </div>
        <div className="dca-sheet-body">
          {c > 0 && (
            <p className="dca-hero">
              {num(c)}
              <span className="unit">{build ? 'records' : `events, day ${day + 1}`}</span>
            </p>
          )}
          <p className="dca-what">{KIND_WHAT[n.kind]}</p>
          {sample.length > 0 && (
            <div className="dca-samp">
              {sample.flatMap(([k, v]) => [<span key={`k${k}`}>{k}</span>, <span key={`v${k}`}>{v}</span>])}
            </div>
          )}
          {up.length > 0 && (
            <>
              <p className="dca-mono dca-h">
                <span>From</span>
                <span>{up.length}</span>
              </p>
              {linkRows(up, 6)}
            </>
          )}
          {down.length > 0 && (
            <>
              <p className="dca-mono dca-h">
                <span>To</span>
                <span>{down.length}</span>
              </p>
              {linkRows(down, 6)}
            </>
          )}
          <p className="dca-mono dca-h">
            <span>More</span>
          </p>
          <button className="dca-linkrow dca-press" onClick={() => setSel({ t: 'ring', ring })}>
            <span className="num">{ring}</span>
            <span className="grow">{RING_NAMES[ring]}</span>
            <span className="st">Ring</span>
          </button>
          <details className="dca-source">
            <summary className="dca-linkrow dca-press">
              <span className="grow">Source</span>
              <span className="st">{cap(n.owner)}</span>
            </summary>
            <div className="dca-kv">
              <span className="dca-mono">What</span>
              <p>{n.source}</p>
            </div>
            <div className="dca-kv">
              <span className="dca-mono">Carries</span>
              <p className="code">{n.fields.join(' · ')}</p>
            </div>
            {n.cadence && (
              <div className="dca-kv">
                <span className="dca-mono">Cadence</span>
                <p>{n.cadence}</p>
              </div>
            )}
            {(n.license || n.url) && (
              <div className="dca-kv">
                <span className="dca-mono">Licence</span>
                <p>
                  {n.license}
                  {n.url && (
                    <>
                      <br />
                      {n.url.includes('{') ? (
                        <span className="code">{n.url}</span>
                      ) : (
                        <a href={n.url} target="_blank" rel="noreferrer">
                          {n.url.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="dca-kv">
              <span className="dca-mono">File</span>
              <p className="code">
                {[...files, ...n.ref].slice(0, 4).map((f) => (
                  <span key={f} style={{ display: 'block' }}>
                    {f}
                  </span>
                ))}
              </p>
            </div>
          </details>
        </div>
      </>
    );
  } else if (sel?.t === 'ring') {
    const list = ringNodes(sel.ring);
    sheet = (
      <>
        <div className="dca-sheet-head">
          <div className="txt">
            <p className="dca-mono">Ring {sel.ring} of 5</p>
            <h2 ref={headRef} tabIndex={-1}>
              {RING_NAMES[sel.ring]}
            </h2>
            <p className="dca-statusline">{list.length} nodes</p>
          </div>
          {closeBtn}
        </div>
        <div className="dca-sheet-body">
          <div className="dca-seg-ctl" role="group" aria-label="Owner">
            {OWNERS.map((o) => (
              <button key={o} className="dca-press" aria-pressed={owner === o} onClick={() => setOwner(owner === o ? null : o)}>
                {cap(o)}
                <i>{NODES.filter((n) => n.owner === o).length}</i>
              </button>
            ))}
          </div>
          <div style={{ height: 12 }} />
          {list
            .filter((n) => owner === null || n.owner === owner)
            .map((n) => (
              <button key={n.id} className="dca-linkrow is-tall dca-press" onClick={() => pick(n.id)}>
                <LineSwatch status={n.status} />
                <span className="grow">{n.label}</span>
                <span className="st">{STATUS_WORD[n.status]}</span>
                <span className="ct">{count(n.id) > 0 ? num(count(n.id)) : ''}</span>
              </button>
            ))}
        </div>
      </>
    );
  } else if (sel?.t === 'metric' && file.metrics[sel.key]) {
    const mm = file.metrics[sel.key];
    const sc = scoreOf(sel.key);
    const trace = names(focus?.nodes ?? []);
    const groups: { label: string; ids: LNode[]; body?: boolean }[] = [];
    const layerName = (l: number) => LINEAGE.meta.layers[String(l)] ?? `Layer ${l}`;
    for (const n of trace) {
      const label = layerName(n.layer).split(/,| /)[0];
      const g = groups.find((x) => x.label === label);
      if (g) g.ids.push(n);
      else groups.push({ label, ids: [n] });
    }
    // The body region sits where scoring hands over to the surfaces.
    const at = groups.findIndex((g) => g.ids.some((n) => n.kind === 'surface'));
    groups.splice(at < 0 ? groups.length : at, 0, { label: 'Body', ids: [], body: true });
    callout = {
      id: 'core_scoring',
      lines: [
        { t: rowName[sel.key], k: 'strong' },
        { t: sc ? `${sc.value} ${mm.unit}, ${CREW_WORD[sc.status]}` : 'Not measured', k: 'sub' },
      ],
    };
    sheet = (
      <>
        <div className="dca-sheet-head">
          <div className="txt">
            <p className="dca-mono">
              {crew.name} · {file.mission.today}
            </p>
            <h2 ref={headRef} tabIndex={-1}>
              {rowName[sel.key]}
            </h2>
            <p className="dca-statusline">
              <StatusShape status={sc?.status ?? 'green'} size={16} />
              {sc ? CREW_WORD[sc.status] : 'Not measured'}
            </p>
          </div>
          {closeBtn}
        </div>
        <div className="dca-sheet-body">
          <p className="dca-hero">
            {sc ? sc.value : '·'}
            <span className="unit">{mm.unit}</span>
          </p>
          {groups.map((g) => (
            <div key={g.label}>
              <p className="dca-mono dca-h">
                <span>{g.label}</span>
                {!g.body && <span>{g.ids.length}</span>}
              </p>
              {g.body ? <p className="dca-bodyrow">{cap(mm.body_region)}</p> : linkRows(g.ids, 4)}
            </div>
          ))}
        </div>
      </>
    );
  }

  /* --------------------------------------------------------------- map */
  const hl = focus
    ? EDGES.map((e, i) => {
        const up = focus.up.has(i);
        const down = focus.down.has(i);
        if (!up && !down) return null;
        return <path key={`${selKey}-${i}`} d={ROUTES[i].d} className={`dca-hl dca-st-${e.status}${down && !up ? ' is-down' : ''}`} />;
      })
    : null;

  const seg = (() => {
    if (!selNode || PLACED[selNode.id].ring === 0) return null;
    const p = PLACED[selNode.id];
    const span = (36 / p.r) * (180 / Math.PI);
    const a = polar(p.r, p.a - span);
    const b = polar(p.r, p.a + span);
    return <path className="dca-seg" d={`M${a.x} ${a.y}A${p.r} ${p.r} 0 0 0 ${b.x} ${b.y}`} />;
  })();

  // Labels: rings 1 and 2 at rest; the lit path, a chosen ring or a filtered slice otherwise.
  const filtered = sector !== 'all' || build || owner !== null;
  const countFs = fs * 0.93;
  const obstacles: [number, number, number, number][] = [];
  const reqs: LabelReq[] = [];
  for (const n of NODES) {
    const p = PLACED[n.id];
    const centre = p.ring === 0;
    const r = centre ? 40 : 24;
    const off = dim(n.id);
    const hasCount = !off && count(n.id) > 0;
    const below = r + (hasCount ? countFs * 1.2 : 0);
    obstacles.push([p.x - r, p.y - r, 2 * r, r + below]);
    if (off) continue;
    const isCall = callout?.id === n.id;
    if (centre && !isCall) continue;
    if (!isCall && !(focus || filtered || p.ring <= 2)) continue;
    reqs.push({
      id: n.id,
      x: p.x,
      y: p.y,
      below,
      lines: isCall && callout ? callout.lines : wrapLabel(n.label).map((t) => ({ t, k: 'label' as const })),
      fs: isCall ? fs * 1.2 : fs,
      priority: isCall ? -1 : p.ring,
      outward: p.ring >= 4,
    });
  }
  // Ring numerals sit on the left hairline.
  RADII.slice(1).forEach((r) => obstacles.push([-r - fs, -fs, 2 * fs, 2 * fs]));
  const labels = placeLabels(reqs, obstacles, { w: (size.w / 2 - 6) / scale, h: (size.h / 2 - 6) / scale });

  const noFlares = replay.flaresInWindow === 0;
  const stepDay = (d: number) => {
    setPlaying(false);
    jump(d);
  };
  const prev = neighbour(-1);
  const next = neighbour(1);
  const buildSteps = (
    [
      ['Fetch', 'ml_fetch_donki'],
      ['Prepare', 'ml_prepare'],
      ['Model', 'ml_model_v1'],
      ['Export', 'ml_export'],
    ] as const
  ).filter(([, id]) => NODE_BY_ID[id]);
  const buildFiles = (['ds_crew_data', 'ds_storm_forecast', 'ds_real_crew'] as const).filter((id) => NODE_BY_ID[id]);

  return (
    <div className="dca-root">
      <div className={`dca-stage${open ? ' has-sheet' : ''}`}>
        {/* Left rail: who, and which metric to trace. */}
        <div className="dca-left">
          <p className="dca-brand">
            e<sup>x</sup> Crew Station
          </p>
          <h1 className="dca-title">Data system</h1>
          <div className="dca-crew">
            {file.crew.map((c) => (
              <button
                key={c.id}
                className={`dca-crewbtn dca-press${c.id === crew.id ? ' is-on' : ''}`}
                aria-label={c.name}
                aria-pressed={c.id === crew.id}
                onClick={() => setCrew(c.id)}
              >
                {initials(c.name)}
                <StatusShape status={statusOn(c, file, file.mission.today, environment).status.overall} size={14} />
              </button>
            ))}
          </div>
          <p className="dca-mono dca-h">
            <span>Trace</span>
            <span>Today</span>
          </p>
          <div className="dca-list">
            {railKeys.map((k) => {
              const s = scoreOf(k);
              const on = sel?.t === 'metric' && sel.key === k;
              return (
                <button key={k} className={`dca-row dca-press${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setSel(on ? null : { t: 'metric', key: k })}>
                  <StatusShape status={s?.status ?? 'green'} size={14} />
                  <span className="grow">{rowName[k]}</span>
                  <span className="val">
                    {s ? s.value : '·'}
                    <span className="unit">{file.metrics[k].unit}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="dca-legend">
            {STATUSES.map((s) => (
              <div key={s}>
                <LineSwatch status={s} />
                {STATUS_WORD[s]}
                <i>{NODES.filter((n) => n.status === s).length}</i>
              </div>
            ))}
          </div>
        </div>

        {/* The map owns the middle cell. */}
        <div className="dca-mapcell" ref={mapRef}>
          <svg className="dca-map" role="group" aria-label="Data system map">
            <g className="dca-cam" style={{ transform: `translate(${cx}px, ${cy}px) scale(${scale})` }}>
              {/* Sector hairline: Crew above, Storm below. */}
              <line className="dca-sector" x1={-46} y1={0} x2={-RADII[5] - 30} y2={0} />
              {RADII.slice(1).map((r, i) => (
                <circle
                  key={r}
                  r={r}
                  pathLength={1}
                  className={`dca-ring${sel?.t === 'ring' && sel.ring === i + 1 ? ' is-sel' : ''}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                  transform="rotate(180)"
                />
              ))}
              <g className="dca-fadein">
                {EDGES.map((e, i) =>
                  ROUTES[i].spoke ? (
                    <path
                      key={i}
                      d={ROUTES[i].spoke as string}
                      className={`dca-spoke dca-st-${e.status}`}
                      style={{ opacity: dim(e.from) || dim(e.to) || (build && edgeStage(e) !== 'build') ? 0.25 : 1 }}
                    />
                  ) : null,
                )}
                {seg}
                {hl}
                <g>
                  {Array.from({ length: POOL }, (_, i) => (
                    <circle key={i} r={4} ref={(el) => (dots.current[i] = el)} style={{ display: 'none' }} />
                  ))}
                </g>

                {RADII.slice(1).map((r, i) => {
                  const on = sel?.t === 'ring' && sel.ring === i + 1;
                  return (
                    <g
                      key={r}
                      transform={`translate(${-r} 0)`}
                      className={`dca-ringbtn${on ? ' is-sel' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ring ${i + 1}, ${RING_NAMES[i + 1]}`}
                      aria-pressed={on}
                      onClick={() => setSel(on ? null : { t: 'ring', ring: i + 1 })}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setSel(on ? null : { t: 'ring', ring: i + 1 });
                        }
                      }}
                    >
                      <circle r={Math.min(hitR, 30)} fill="transparent" />
                      <circle r={fs * 0.9} className="dca-ringdot" />
                      <text className="dca-ringnum" style={{ fontSize: fs }} dy={fs * 0.36}>
                        {i + 1}
                      </text>
                    </g>
                  );
                })}

                {NODES.map((n) => {
                  const p = PLACED[n.id];
                  const isSel = selNode?.id === n.id;
                  const off = dim(n.id);
                  const c = off ? 0 : count(n.id);
                  const centre = p.ring === 0;
                  return (
                    <g key={n.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                      <g
                        className={`dca-node st-${n.status}${isSel ? ' is-sel' : ''}${focus && focus.nodes.has(n.id) ? ' is-on' : ''}${off ? ' is-dim' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${n.label}, ${STATUS_WORD[n.status]}`}
                        aria-pressed={isSel}
                        onClick={() => pick(n.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            pick(n.id);
                          }
                        }}
                      >
                        <circle r={hitR} fill="transparent" />
                        {centre ? (
                          <>
                            <circle r={38} className="dca-core" />
                            <text className="dca-coretext" y={9} x={-4}>
                              e
                              <tspan dy={-11} fontSize={17}>
                                x
                              </tspan>
                            </text>
                          </>
                        ) : (
                          <>
                            <circle r={22} className={`dca-disc dca-st-${n.status}`} />
                            {n.status === 'offline-sample' && <circle r={17.5} className="dca-disc2" />}
                            <g className="dca-icon">
                              <KindIcon kind={n.kind} />
                            </g>
                          </>
                        )}
                        {c > 0 && (
                          <text className="dca-count" style={{ fontSize: countFs }} y={(centre ? 40 : 24) + countFs}>
                            {num(c)}
                          </text>
                        )}
                      </g>
                    </g>
                  );
                })}

                <g pointerEvents="none">
                  {labels.map((l) => (
                    <text key={l.id} className="dca-label" textAnchor={l.anchor} style={{ fontSize: l.fs }}>
                      {l.lines.map((ln, j) => (
                        <tspan key={j} x={l.x} y={l.y + j * l.lh} className={`k-${ln.k}`}>
                          {ln.t}
                        </tspan>
                      ))}
                    </text>
                  ))}
                </g>
              </g>
            </g>
          </svg>
          <p className={`dca-cap is-top${sector === 'storm' ? ' is-off' : ''}`}>
            <b>Crew</b>
            Simulated
          </p>
          <p className={`dca-cap is-bottom${sector === 'crew' ? ' is-off' : ''}`}>
            <b>Storm</b>
            {noFlares ? 'No flares in window' : 'Real DONKI'}
          </p>
        </div>

        {/* Detail sheet: its own column, so it never covers the map. */}
        {open && (
          <section className="dca-sheet" ref={sheetRef} aria-label="Details" key={sel?.t}>
            {sheet}
            <div className="dca-sheet-foot">
              {prev && (
                <button className="dca-nav dca-press" onClick={prev.go}>
                  <span className="dca-mono">Previous</span>
                  <span className="nm">{prev.label}</span>
                </button>
              )}
              {next && (
                <button className="dca-nav dca-press" onClick={next.go}>
                  <span className="dca-mono">Next</span>
                  <span className="nm">{next.label}</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* One bottom bar: the replay transport, or the build steps. */}
        <div className="dca-bar">
          {build ? (
            <>
              <div className="dca-clock">
                <p className="dca-num">Build</p>
                <p className="dca-tallyline">Before the app loads</p>
              </div>
              <div className="dca-steps">
                {buildSteps.map(([word, id], i) => (
                  <button key={id} className={`dca-stepbtn dca-press${selNode?.id === id ? ' is-on' : ''}`} onClick={() => pick(id)}>
                    <span className="num">{i + 1}</span>
                    {word}
                  </button>
                ))}
              </div>
              <div className="dca-files">
                {buildFiles.map((id) => (
                  <button key={id} className="dca-filebtn dca-press" onClick={() => pick(id)}>
                    <b>{num(count(id))}</b>
                    <span>{NODE_BY_ID[id].label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                className="dca-play dca-press"
                onClick={() => {
                  if (day >= lastDay) jump(0);
                  setPlaying((p) => (day >= lastDay ? true : !p));
                }}
              >
                <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden>
                  {playing && day < lastDay ? <path d="M7 5h5v18H7zM16 5h5v18h-5z" /> : <path d="M8 4l15 10L8 24z" />}
                </svg>
                {playing && day < lastDay ? 'Pause' : day >= lastDay ? 'Restart' : 'Play'}
              </button>
              <button className="dca-sq dca-press" aria-label="Previous day" disabled={day <= 0} onClick={() => stepDay(day - 1)}>
                <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
                  <path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" strokeWidth={2} />
                </svg>
              </button>
              <button className="dca-sq dca-press" aria-label="Next day" disabled={day >= lastDay} onClick={() => stepDay(day + 1)}>
                <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
                  <path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" strokeWidth={2} />
                </svg>
              </button>
              <div className="dca-clock">
                <p className="dca-num">
                  Day {day + 1}
                  <span className="unit">
                    of {replay.dates.length} · {replay.dates[day]}
                  </span>
                </p>
                <p className="dca-tallyline">
                  {num(busCount('observation'))} readings · {num(busCount('flag'))} flags · {noFlares ? 'no flares in window' : `${num(busCount('alert'))} alerts`} ·{' '}
                  {num(busCount('report'))} reports, simulated
                </p>
              </div>
              <svg
                className="dca-strip"
                viewBox={`0 0 ${replay.dates.length * 4} 40`}
                preserveAspectRatio="none"
                role="slider"
                tabIndex={0}
                aria-label="Mission day"
                aria-valuemin={1}
                aria-valuemax={replay.dates.length}
                aria-valuenow={day + 1}
                aria-valuetext={replay.dates[day]}
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  const box = ev.currentTarget.getBoundingClientRect();
                  stepDay(Math.floor(((ev.clientX - box.left) / box.width) * replay.dates.length));
                }}
                onPointerMove={(ev) => {
                  if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
                  const box = ev.currentTarget.getBoundingClientRect();
                  const d = Math.max(0, Math.min(lastDay, Math.floor(((ev.clientX - box.left) / box.width) * replay.dates.length)));
                  if (d !== day) stepDay(d);
                }}
                onKeyDown={(ev) => {
                  const to =
                    ev.key === 'ArrowLeft' || ev.key === 'ArrowDown'
                      ? day - 1
                      : ev.key === 'ArrowRight' || ev.key === 'ArrowUp'
                        ? day + 1
                        : ev.key === 'Home'
                          ? 0
                          : ev.key === 'End'
                            ? lastDay
                            : null;
                  if (to === null) return;
                  ev.preventDefault();
                  stepDay(to);
                }}
              >
                {replay.dates.map((d, i) => {
                  const s: Status = replay.dayStatus[i];
                  const h = s === 'red' ? 26 : s === 'amber' ? 18 : 8;
                  const fill = s === 'red' ? 'var(--c-crit)' : s === 'amber' ? 'var(--c-warn)' : 'var(--ink-2)';
                  return (
                    <g key={d} opacity={i <= day ? 1 : 0.5}>
                      <rect x={i * 4 + 0.5} y={32 - h} width={3} height={h} fill={fill} />
                      {replay.dayAlert[i] !== 'none' && <rect x={i * 4 + 0.5} y={36} width={3} height={4} fill={replay.dayAlert[i] === 'warning' ? 'var(--c-crit)' : 'var(--c-warn)'} />}
                    </g>
                  );
                })}
                <rect x={day * 4} y={0} width={4} height={34} fill="none" stroke="var(--blue)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </svg>
            </>
          )}
          <div className="dca-seg-ctl" role="group" aria-label="Sector">
            {(['all', 'crew', 'storm'] as const).map((s) => (
              <button key={s} className="dca-press" aria-pressed={sector === s} onClick={() => setSector(s)}>
                {cap(s)}
              </button>
            ))}
          </div>
          <div className="dca-seg-ctl" role="group" aria-label="Stage">
            {(['runtime', 'build'] as const).map((s) => (
              <button key={s} className="dca-press" aria-pressed={stage === s} onClick={() => setStage(s)}>
                {cap(s)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Footer className="dca-footer" />
    </div>
  );
}
