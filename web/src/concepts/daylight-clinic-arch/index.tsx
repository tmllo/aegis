// Daylight Clinic, data architecture map.
// An orbital map of docs/lineage.json: e^x (bus and scoring core) in the centre,
// five hairline rings out to the outside world, the five body regions between
// Scoring and the screens. The map is fixed (Crew above, Storm below) and opens
// with one path already lit: the worst metric of the selected crew member on the
// replay day, from its source to the ground. Packets are real events: the replay
// walks crew_data.json day by day through core/scoring and places the flares of
// storm_forecast.json on the same clock.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Footer } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { regionStatus, type MetricScore } from '../../core/scoring';
import { toFhir } from '../../core/observation';
import type { ConceptMeta } from '../../registry';
import type { CrewMember, MetricKey, MissionData, Region, Status } from '../../data/types';
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
  direct,
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
import { placeLabels, type LabelLine, type LabelReq } from './labels';
import { TRUNK, createReplay, type Journey, type Tone } from './replay';
import { CREW_WORD, KIND_WORD, KindIcon, LineSwatch, STATUS_WORD, StatusMark, StatusShape, plainName } from './parts';
import './daylight.css';

export const meta: ConceptMeta = {
  title: 'Daylight Clinic: Data system',
  direction: 'Daylight Clinic',
  surface: 'architecture',
};

type Sel = { t: 'node'; id: string } | { t: 'ring'; ring: number } | { t: 'metric'; key: MetricKey } | null;
type SectorFilter = 'all' | 'crew' | 'storm';
type Stage = 'build' | 'runtime' | null;

const TICK_MS = 1400;
/** While paused, the events of the current day are drawn again on this cycle. */
const LOOP_MS = 5200;
const POOL = 90;
const COLLAPSED_ROWS = 5;
const STATUSES: LStatus[] = ['live', 'simulated', 'offline-sample', 'planned'];
const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
/** Counts stay on the centre and the four screens; everywhere else the same number would repeat. */
const COUNTED = new Set(['core_bus', 'sf_console', 'sf_radiation', 'sf_wrist', 'sf_systems']);
/** The link, ground and handoff cores are stand-ins: no count is shown for them. */
const UNCOUNTED = new Set(['core_link', 'sf_ground', 'person_surgeon', 'person_cmo', 'core_handoff', 'ext_cmo_da']);

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
  const words = label.split(/\s+/);
  if (label.length <= 11 || words.length === 1) return [label];
  let best = 1;
  let bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const len = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (len < bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
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

/** A real value for a node on the replay day, read from the loaded data files or the core. */
function sampleFor(
  n: LNode,
  data: MissionData,
  member: CrewMember,
  day: number,
  date: string,
  scores: MetricScore[],
  busCount: (k: 'observation' | 'flag' | 'alert' | 'report') => number,
  envLabel: string,
): [string, string][] {
  const m = data.crew.metrics;
  const row = member.series[Math.min(day, member.series.length - 1)];
  const val = (k: MetricKey) => (row?.[k] == null ? 'not measured' : `${row[k]} ${m[k].unit}`);
  const keys = [...new Set([...n.fields, ...(n.maps_to ?? [])])].filter((k): k is MetricKey => k in m);
  const storm = data.storm;

  if (n.region) {
    return scores.filter((s) => m[s.metric].body_region === n.region).map((s) => [shortLabel(m[s.metric].label), `${s.value} ${m[s.metric].unit}`]);
  }
  if (['ds_storm_forecast', 'ml_export', 'core_radiation', 'sf_radiation'].includes(n.id)) {
    // The latest flare up to the replay day; before the first one, the first in the file.
    const past = storm.events.filter((e) => e.peak_time.slice(0, 10) <= date);
    const pool = past.length ? past : storm.events;
    const e = pool.reduce((a, b) => (b.peak_time > a.peak_time ? b : a), pool[0]);
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
      ['Horizon', `${storm.meta.horizon_hours} h`],
      ['Model', storm.meta.model],
      ['Watch at', storm.meta.thresholds.watch.toFixed(3)],
      ['Warning at', storm.meta.thresholds.warning.toFixed(3)],
    ];
  }
  if (['api_donki', 'ml_fetch_donki', 'ml_prepare'].includes(n.id)) {
    return [
      ['Flares scored', num(storm.events.length)],
      ['Credit', storm.meta.data_credit],
      ['Test period', storm.meta.test_period.join(' to ')],
    ];
  }
  if (['ds_real_crew', 'ml_real_crew', 'ds_osd575'].includes(n.id)) {
    if (!data.real) return [];
    const f = data.real.flags[0];
    return [
      ['Draws flagged', num(data.real.flags.length)],
      ['Mission', data.real.meta.mission],
      ...(f ? ([[`${f.crew} ${f.timepoint}`, `${f.analyte} ${f.value} ${f.unit}`]] as [string, string][]) : []),
    ];
  }
  if (n.id === 'core_observation') {
    const k = (Object.keys(m) as MetricKey[])[0];
    const fhir = toFhir({ subject: member.id, metric: k, value: row?.[k] ?? null, unit: m[k].unit, time: row.date, source: 'replay:crew_data.json' });
    return [
      [shortLabel(m[k].label), val(k)],
      ['FHIR', JSON.stringify(fhir)],
    ];
  }
  if (['core_scoring', 'ml_crew_flags', 'core_escalation', 'core_handoff', 'person_cmo'].includes(n.id)) {
    const w = scores.reduce<MetricScore | null>((a, s) => (!a || RANK[s.status] > RANK[a.status] ? s : a), null);
    if (!w) return [];
    return [
      [shortLabel(m[w.metric].label), `${w.value} ${m[w.metric].unit}`],
      ['Status', CREW_WORD[w.status]],
      ['3-day z', w.z === null ? 'absolute band' : w.z.toFixed(2)],
    ];
  }
  if (n.id === 'core_bus' || n.id === 'sf_systems') {
    return [
      ['Readings', num(busCount('observation'))],
      ['Flags', num(busCount('flag'))],
      ['Alerts', num(busCount('alert'))],
      ['Reports', num(busCount('report'))],
    ];
  }
  if (['core_link', 'sf_ground', 'person_surgeon'].includes(n.id)) {
    return [
      ['Reports queued', num(busCount('report'))],
      ['Environment', envLabel],
    ];
  }
  if (n.id === 'ds_published_ranges') {
    return (Object.keys(member.baseline) as MetricKey[]).slice(0, 4).map((k) => {
      const b = member.baseline[k];
      return [shortLabel(m[k].label), b ? `${b.mean} ± ${b.sd} ${m[k].unit}` : ''] as [string, string];
    });
  }
  if (keys.length) return keys.slice(0, 4).map((k) => [shortLabel(m[k].label), val(k)] as [string, string]);
  if (n.samples?.length) return n.samples.slice(0, 3).map((s, j) => [`Saved file ${j + 1}`, s.split('/').pop() ?? s] as [string, string]);
  return [];
}

export default function DaylightClinicArch() {
  const { data, loadState, error } = useMissionData();
  const crew = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);

  const [sel, setSel] = useState<Sel>(initialSel);
  const [sector, setSector] = useState<SectorFilter>(() => (['crew', 'storm'].includes(params().get('sector') ?? '') ? (params().get('sector') as SectorFilter) : 'all'));
  const [stage, setStage] = useState<Stage>(() => (['build', 'runtime'].includes(params().get('stage') ?? '') ? (params().get('stage') as Stage) : null));
  const [team, setTeam] = useState(() => params().has('sector') || params().has('stage') || params().get('team') === '1');
  const [allRows, setAllRows] = useState(false);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(() => params().get('play') === '1');
  const [, setVersion] = useState(0);
  const [size, setSize] = useState({ w: 1920, h: 1020 });

  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const packets = useRef<{ route: number; t0: number; dur: number; tone: Tone; still?: boolean }[]>([]);
  const clock = useRef(0);
  const dayRef = useRef(0);
  const loopAcc = useRef(0);
  const hiddenEdges = useRef(new Set<number>());
  const packetScale = useRef(1);
  const sticky = useRef<{ crew: string; key: MetricKey } | null>(null);

  const crewParam = useRef(params().get('crew'));
  useEffect(() => {
    const q = crewParam.current;
    if (q && data?.crew.crew.some((c) => c.id === q)) setCrew(q);
  }, [data, setCrew]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
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
      loopAcc.current = LOOP_MS - 250;
      dayRef.current = to;
      setDay(to);
      setVersion((v) => v + 1);
    },
    [replay],
  );

  // The clock opens on mission.today, so every value on screen belongs to the same day.
  useEffect(() => {
    if (!replay || !data) return;
    const q = params().get('day');
    const today = replay.dates.indexOf(data.crew.mission.today);
    jump(q !== null ? Number(q) - 1 : today >= 0 ? today : replay.dates.length - 1);
  }, [replay, data, jump]);

  const playingNow = useRef(playing);
  playingNow.current = playing;
  const schedule = useCallback(
    (journeys: Journey[]) => {
      const ends = new Map<number, number>();
      for (const j of journeys) {
        let t = j.after >= 0 ? (ends.get(j.after) ?? clock.current) : clock.current;
        for (const e of j.hops) {
          // 1.2 to 2.4 s per hop, by length.
          const dur = Math.max(1200, Math.min(2400, (ROUTES[e].len / 200) * 1000));
          if (reduced) packets.current.push({ route: e, t0: clock.current, dur: playingNow.current ? TICK_MS : LOOP_MS + 60, tone: j.tone, still: true });
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
  useEffect(() => {
    if (!replay) return;
    let raf = 0;
    let prev = performance.now();
    let acc = 0;
    let buildAcc = 0;
    let buildIdx = 0;
    const buildEdges = EDGES.map((e, i) => (edgeStage(e) === 'build' && !e.relation && e.status !== 'planned' ? i : -1)).filter((i) => i >= 0);
    const place = (el: SVGCircleElement | null, route: number, t: number, r: number, tone: Tone, opacity: number) => {
      if (!el) return;
      const pos = ROUTES[route].at(Math.max(0, Math.min(1, t)));
      el.setAttribute('cx', pos.x.toFixed(1));
      el.setAttribute('cy', pos.y.toFixed(1));
      el.setAttribute('r', r.toFixed(1));
      el.setAttribute('class', `dca-packet t-${tone}`);
      el.style.opacity = String(opacity);
      el.style.display = '';
    };
    const frame = (now: number) => {
      const dt = Math.min(100, now - prev);
      prev = now;
      clock.current += dt;
      if (stageNow.current === 'build') {
        // Build time has no clock in the data: one neutral packet walks the pipeline edges in file order.
        buildAcc += dt;
        if (!reduced && buildAcc >= 420 && buildEdges.length) {
          buildAcc = 0;
          const e = buildEdges[buildIdx++ % buildEdges.length];
          packets.current.push({ route: e, t0: clock.current, dur: Math.max(1200, Math.min(2400, ROUTES[e].len * 5)), tone: 'neutral' });
        }
      } else if (playingNow.current) {
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
      } else {
        loopAcc.current += dt;
        if (loopAcc.current >= LOOP_MS) {
          loopAcc.current = 0;
          schedule(replay.step(dayRef.current, true));
        }
      }
      const t = clock.current;
      packets.current = packets.current.filter((p) => t < p.t0 + p.dur);
      const list = packets.current;
      const k0 = 1 / Math.max(0.6, packetScale.current);
      let k = 0;
      for (let i = 0; i < list.length && k < POOL; i++) {
        const p = list[i];
        if (t < p.t0 || hiddenEdges.current.has(p.route)) continue;
        // 5 px for a reading, 6 px when it carries a flag; two fading dots trail behind.
        const r = (p.tone === 'neutral' ? 5 : 6) * k0;
        const u = p.still ? 0.5 : (t - p.t0) / p.dur;
        const lag = p.still ? 0 : 90 / p.dur;
        place(dots.current[k * 3], p.route, u, r, p.tone, 1);
        place(dots.current[k * 3 + 1], p.route, u - lag, r * 0.72, p.tone, p.still ? 0 : 0.4);
        place(dots.current[k * 3 + 2], p.route, u - lag * 2, r * 0.5, p.tone, p.still ? 0 : 0.18);
        k += 1;
      }
      for (let i = k * 3; i < POOL * 3; i++) {
        const el = dots.current[i];
        if (el && el.style.display !== 'none') el.style.display = 'none';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [replay, schedule, reduced]);

  useEffect(() => {
    packets.current = [];
    loopAcc.current = LOOP_MS - 250;
  }, [stage, sector]);

  // Selection lives in the URL so the body surface can link straight to a node or metric.
  useEffect(() => {
    const q = new URLSearchParams();
    if (sel?.t === 'node') q.set('node', sel.id);
    if (sel?.t === 'ring') q.set('ring', String(sel.ring));
    if (sel?.t === 'metric') q.set('metric', sel.key);
    if (crew) q.set('crew', crew.id);
    window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`);
  }, [sel, crew]);

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

  if (loadState === 'error') return <p style={{ padding: 32 }}>{error}</p>;
  if (!data || !crew || !environment || !replay) return <div className="dca-root" />;

  const file = data.crew;
  const lastDay = replay.dates.length - 1;
  const date = replay.dates[day];
  // Everything on the left follows the replay day, scored by the core.
  const scores = replay.scoresOn(crew.id, day);
  const regions = regionStatus(scores, file.metrics);
  const scoreOf = (k: MetricKey) => scores.find((s) => s.metric === k);
  const open = sel !== null;
  const selNode = sel?.t === 'node' ? NODE_BY_ID[sel.id] : null;
  const selMetric = sel?.t === 'metric' && file.metrics[sel.key] ? sel.key : null;
  const building = stage === 'build';

  // The path lit at rest: the worst metric of the day. On an all-green day the last one stays lit, in the neutral colour.
  const worst = scores.reduce<MetricScore | null>((a, s) => (!a || RANK[s.status] > RANK[a.status] || (RANK[s.status] === RANK[a.status] && (s.score ?? 0) > (a.score ?? 0)) ? s : a), null);
  if (worst && (worst.status !== 'green' || sticky.current?.crew !== crew.id)) sticky.current = { crew: crew.id, key: worst.metric };
  const autoKey = sel === null && sector !== 'storm' && !building && sticky.current?.crew === crew.id ? sticky.current.key : null;
  const traceKey = selMetric ?? autoKey;
  const traceRegion: Region | null = traceKey ? file.metrics[traceKey].body_region : null;
  const trace = traceKey ? metricTrace(traceKey, metricKeys, traceKey.startsWith('dose'), traceRegion) : null;
  const traceStatus: Status = traceKey ? (scoreOf(traceKey)?.status ?? 'green') : 'green';

  // Node focus: its whole upstream and downstream on the map; the sheet lists direct neighbours only.
  const hood = selNode ? neighbourhood(selNode.id) : null;
  const focusNodes: Set<string> | null = selNode
    ? new Set([selNode.id, ...(hood?.up.nodes ?? []), ...(hood?.down.nodes ?? [])])
    : sel?.t === 'ring'
      ? new Set(ringNodes(sel.ring).map((n) => n.id))
      : selMetric && trace
        ? trace.nodes
        : null;
  const litNodes = focusNodes ?? trace?.nodes ?? null;

  // Camera: the map never turns. It sits between the side lists and slides left when the sheet is up.
  const narrow = size.w < 1500;
  const leftW = narrow ? 296 : 336;
  const sheetW = narrow ? 440 : 560;
  const rightW = open ? sheetW : narrow && size.w < 1200 ? 0 : 336;
  const room = size.w - leftW - rightW;
  const scale = Math.max(0.36, Math.min(1, (size.h - 70) / 950, (room - 20) / 990));
  const cx = leftW + room / 2;
  const cy = size.h / 2 + 4;
  packetScale.current = scale;
  // Text keeps its size on screen: the rings shrink, the type does not.
  const fs = Math.max(13, 12 / scale);
  const hitR = Math.min(60, 36 / scale);
  const dense = scale < 0.75;
  const rimOutside = (room / scale - 990) / 2 >= 124;

  const dimSector = (id: string) => sector !== 'all' && sectorOf(id) !== sector && sectorOf(id) !== 'both';
  const dim = (id: string) => (focusNodes !== null && !focusNodes.has(id)) || dimSector(id) || !inStage(id, stage);
  hiddenEdges.current = new Set(EDGES.map((e, i) => (dimSector(e.from) || dimSector(e.to) ? i : -1)).filter((i) => i >= 0));

  const pick = (id: string) => setSel((s) => (s?.t === 'node' && s.id === id ? null : { t: 'node', id }));
  const count = (id: string): number => {
    if (!building) return replay.counts.get(id) ?? 0;
    // Build time: record counts read from the files themselves.
    if (id === 'ds_crew_data') return file.crew.reduce((a, c) => a + c.series.length, 0);
    if (id === 'ds_storm_forecast') return data.storm.events.length;
    if (id === 'ds_real_crew') return data.real ? data.real.crew.reduce((a, c) => a + c.series.length, 0) : 0;
    return 0;
  };
  const busCount = (k: 'observation' | 'flag' | 'alert' | 'report') => replay.bus.count(k);

  const step = (dir: 1 | -1) => {
    if (sel?.t === 'node') {
      const i = ORDERED.findIndex((n) => n.id === sel.id);
      setSel({ t: 'node', id: ORDERED[(i + dir + ORDERED.length) % ORDERED.length].id });
    } else if (sel?.t === 'ring') {
      setSel({ t: 'ring', ring: ((sel.ring - 1 + dir + 5) % 5) + 1 });
    } else if (sel?.t === 'metric') {
      const i = metricKeys.indexOf(sel.key);
      setSel({ t: 'metric', key: metricKeys[(i + dir + metricKeys.length) % metricKeys.length] });
    }
  };

  const bodyHref = (region: Region, metric?: MetricKey) => {
    const q = new URLSearchParams({ crew: crew.id, region });
    if (metric) q.set('metric', metric);
    return `${import.meta.env.BASE_URL}concepts/daylight-clinic-body?${q}`;
  };
  const dayLine = `Day ${day + 1} · ${date}`;

  // Left list: flagged metrics first, the rest behind "All".
  const ordered = [...metricKeys].sort((a, b) => RANK[scoreOf(b)?.status ?? 'green'] - RANK[scoreOf(a)?.status ?? 'green']);
  const flaggedCount = ordered.filter((k) => (scoreOf(k)?.status ?? 'green') !== 'green').length;
  const pinned = traceKey && ordered.indexOf(traceKey) >= Math.max(COLLAPSED_ROWS, flaggedCount) ? traceKey : null;
  const shown = allRows ? ordered : [...ordered.slice(0, Math.max(COLLAPSED_ROWS, flaggedCount) - (pinned ? 1 : 0)), ...(pinned ? [pinned] : [])];

  const linkRows = (list: LNode[]) => (
    <div className="dca-linkgrid">
      {list.map((u) => (
        <button key={u.id} className="dca-linkrow dca-press" onClick={() => pick(u.id)}>
          <LineSwatch status={u.status} />
          <span>{plainName(u)}</span>
        </button>
      ))}
    </div>
  );

  /* ------------------------------------------------------------- sheet */
  let sheet: JSX.Element | null = null;
  let primary: JSX.Element = (
    <button className="dca-wide dca-press" onClick={() => setSel(null)}>
      Back to map
    </button>
  );
  if (selNode) {
    const n = selNode;
    const sample = sampleFor(n, data, crew, day, date, scores, busCount, file.environments[environment].label);
    const heroOk = sample.length > 0 && sample[0][1].length <= 16;
    const rest = heroOk ? sample.slice(1) : sample;
    const files = [n.path, n.impl, ...(n.samples ?? [])].filter(Boolean) as string[];
    const near = direct(n.id);
    const st: Status | null = n.region ? regions[n.region] : null;
    if (n.region) {
      const region = n.region;
      primary = (
        <a className="dca-wide dca-press" href={bodyHref(region)}>
          Open on body
        </a>
      );
    }
    sheet = (
      <>
        <div className="dca-sheet-head">
          <div className="txt">
            <p className="dca-cap">
              {KIND_WORD[n.kind]} · {n.region ? dayLine : `Ring ${PLACED[n.id].ring}`}
            </p>
            <h2>{plainName(n)}</h2>
            <p className="dca-statusline">
              {st ? (
                <>
                  <StatusShape status={st} size={14} />
                  {CREW_WORD[st]}
                </>
              ) : (
                <>
                  <LineSwatch status={n.status} />
                  {STATUS_WORD[n.status]}
                </>
              )}
            </p>
          </div>
          <button className="dca-sq dca-press" onClick={() => setSel(null)}>
            Close
          </button>
        </div>
        <div className="dca-sheet-body">
          {n.region ? (
            <div className="dca-block">
              <p className="dca-cap">{crew.name}</p>
              {scores
                .filter((s) => file.metrics[s.metric].body_region === n.region)
                .map((s) => (
                  <button key={s.metric} className="dca-row dca-press" onClick={() => setSel({ t: 'metric', key: s.metric })}>
                    <StatusShape status={s.status} size={14} />
                    <span className="grow">{rowName[s.metric]}</span>
                    <span className="val">
                      {s.value}
                      <span className="unit">{file.metrics[s.metric].unit}</span>
                    </span>
                  </button>
                ))}
            </div>
          ) : (
            <>
              {heroOk && (
                <div className="dca-block">
                  <p className="dca-cap">
                    {sample[0][0]} · {building ? 'Build' : dayLine}
                  </p>
                  <p className="dca-hero">{sample[0][1]}</p>
                </div>
              )}
              {rest.length > 0 && (
                <div className="dca-samp">
                  {rest.flatMap(([k, v]) => [
                    <span key={`k${k}`} className="k">
                      {k}
                    </span>,
                    <span key={`v${k}`} className={v.length > 40 ? 'code' : undefined}>
                      {v}
                    </span>,
                  ])}
                </div>
              )}
            </>
          )}
          {near.from.length > 0 && (
            <div className="dca-block">
              <p className="dca-cap">From</p>
              {linkRows(near.from)}
            </div>
          )}
          {near.to.length > 0 && (
            <div className="dca-block">
              <p className="dca-cap">To</p>
              {linkRows(near.to)}
            </div>
          )}
          <details className="dca-source">
            <summary className="dca-press">
              <span>Source</span>
              <span className="dca-cap">{n.cadence ?? STATUS_WORD[n.status]}</span>
            </summary>
            <div className="dca-kv">
              <span className="dca-cap">What</span>
              <p>{n.source}</p>
            </div>
            {plainName(n) !== n.label && (
              <div className="dca-kv">
                <span className="dca-cap">Name</span>
                <p className="code">{n.label}</p>
              </div>
            )}
            <div className="dca-kv">
              <span className="dca-cap">Carries</span>
              <p className="code">{n.fields.join(' · ')}</p>
            </div>
            {(n.license || n.url) && (
              <div className="dca-kv">
                <span className="dca-cap">Licence</span>
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
              <span className="dca-cap">File</span>
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
            <p className="dca-cap">Ring {sel.ring} of 5</p>
            <h2>{RING_NAMES[sel.ring]}</h2>
            <p className="dca-statusline">{list.length} nodes</p>
          </div>
          <button className="dca-sq dca-press" onClick={() => setSel(null)}>
            Close
          </button>
        </div>
        <div className="dca-sheet-body">
          {list.map((n) => (
            <button key={n.id} className="dca-ringrow dca-press" onClick={() => pick(n.id)}>
              <LineSwatch status={n.status} />
              <span>{plainName(n)}</span>
              <span className="r">{STATUS_WORD[n.status]}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (selMetric && trace) {
    const mm = file.metrics[selMetric];
    const sc = scoreOf(selMetric);
    const path = [...trace.nodes].map((id) => NODE_BY_ID[id]).sort((a, b) => a.layer - b.layer || PLACED[a.id].ring - PLACED[b.id].ring);
    const groups: { label: string; ids: LNode[] }[] = [];
    // Layer 0 holds sensors, files and generators alike, so it is named "Source".
    const layerName = (l: number) => (l === 0 ? 'Source' : (LINEAGE.meta.layers[String(l)] ?? '').split(/,| /)[0]);
    for (const n of path) {
      if (n.region) continue;
      const label = layerName(n.layer);
      const g = groups.find((x) => x.label === label);
      if (g) g.ids.push(n);
      else groups.push({ label, ids: [n] });
    }
    const region = mm.body_region;
    primary = (
      <a className="dca-wide dca-press" href={bodyHref(region, selMetric)}>
        Open on body
      </a>
    );
    sheet = (
      <>
        <div className="dca-sheet-head">
          <div className="txt">
            <p className="dca-cap">
              {crew.name} · {dayLine}
            </p>
            <h2>{rowName[selMetric]}</h2>
            <p className="dca-statusline">
              <StatusShape status={sc?.status ?? 'green'} size={14} />
              {sc ? CREW_WORD[sc.status] : 'Not measured'}
            </p>
          </div>
          <button className="dca-sq dca-press" onClick={() => setSel(null)}>
            Close
          </button>
        </div>
        <div className="dca-sheet-body">
          <p className="dca-hero">
            {sc ? sc.value : '·'}
            <span className="unit">{mm.unit}</span>
          </p>
          <a className="dca-bodylink dca-press" href={bodyHref(region, selMetric)}>
            <span className={`dca-bodyglyph dca-tone-${regions[region]}`}>
              <svg width={36} height={36} viewBox="-18 -18 36 36" aria-hidden>
                <circle r={16} />
                <KindIcon kind="body" region={region} />
              </svg>
            </span>
            <span className="dca-cap">Body</span>
            <span className="name">{cap(region)}</span>
            <span className="go">Open</span>
          </a>
          <p className="dca-explain">{mm.explain}</p>
          <p className="dca-cap dca-pathhead">Path</p>
          {groups.map((g) => (
            <div key={g.label} className="dca-step">
              <span className="dca-cap">{g.label}</span>
              <div className="dca-links">
                {g.ids.map((n) => (
                  <button key={n.id} className={`dca-press${n.status === 'planned' ? ' is-planned' : ''}`} onClick={() => pick(n.id)}>
                    {plainName(n)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  /* --------------------------------------------------------------- map */
  const tone = traceStatus === 'green' ? '' : ` t-${traceStatus}`;
  const hl: JSX.Element[] = [];
  if (hood) {
    EDGES.forEach((e, i) => {
      const up = hood.up.edges.has(i);
      const down = hood.down.edges.has(i);
      if (up || down) hl.push(<path key={`n-${selNode?.id}-${i}`} d={ROUTES[i].d} className={`dca-hl dca-st-${e.status}${down && !up ? ' is-down' : ''}`} />);
    });
  } else if (trace && sel?.t !== 'ring') {
    // Neutral up to Scoring; from the hop where the flag is raised the path carries the status colour.
    const order = [...trace.edges].sort((a, b) => Number(trace.flagged.has(a)) - Number(trace.flagged.has(b)));
    for (const i of order) {
      hl.push(<path key={`m-${traceKey}-${i}`} d={ROUTES[i].d} className={`dca-hl dca-st-${EDGES[i].status}${trace.flagged.has(i) ? `${tone} is-after` : ''}${selMetric ? '' : ' is-rest'}`} />);
    }
  }

  const selP = selNode ? PLACED[selNode.id] : null;
  const seg = (() => {
    if (!selP || selP.ring === 0) return null;
    const span = (34 / selP.r) * (180 / Math.PI);
    const a = polar(selP.r, selP.a - span);
    const b = polar(selP.r, selP.a + span);
    return <path className="dca-seg" d={`M${a.x} ${a.y}A${selP.r} ${selP.r} 0 0 0 ${b.x} ${b.y}`} />;
  })();
  // Hairline from the chosen node to the sheet edge.
  const sheetX = (size.w - sheetW - cx) / scale;
  const leader = selP && selP.x + 30 < sheetX ? <path className="dca-leader" d={`M${(selP.x + (selP.ring === 0 ? 36 : 25)).toFixed(1)} ${selP.y.toFixed(1)}H${sheetX.toFixed(1)}`} /> : null;

  // Labels: every label is tried below, above and beside its disc and takes the first free spot.
  const radiusOf = (n: LNode) => (PLACED[n.id].ring === 0 ? 34 : n.kind === 'body' ? 15 : 22);
  const counted = (n: LNode) =>
    count(n.id) > 0 && !UNCOUNTED.has(n.id) && n.kind !== 'body' && !dim(n.id) && (COUNTED.has(n.id) || selNode?.id === n.id || (building && n.kind === 'dataset'));
  const isWhere = (n: LNode) => n.kind === 'body' && n.region === traceRegion && trace !== null && sel?.t !== 'ring' && !selNode;
  const obstacles: [number, number, number, number][] = [];
  for (const n of NODES) {
    const p = PLACED[n.id];
    const R = radiusOf(n) + (isWhere(n) ? 7 : 3);
    obstacles.push([p.x - R, p.y - R, R * 2, R * 2]);
    if (counted(n)) {
      const w = num(count(n.id)).length * fs * 0.62 + 6;
      obstacles.push(p.ring === 0 ? [-w / 2, 38, w, fs * 1.3] : [p.x + 26, p.y - fs * 0.7, w, fs * 1.4]);
    }
  }
  RADII.slice(1).forEach((r) => obstacles.push([-r + 4, 4, 20, fs * 1.6]));
  if (!rimOutside) obstacles.push([(-RADII[5] - RADII[4]) / 2 - 22, -fs * 1.8, 60, fs * 4.8]);
  const reqs: LabelReq[] = [];
  for (const n of NODES) {
    const p = PLACED[n.id];
    if (p.ring === 0 || dim(n.id)) continue;
    const isLit = litNodes?.has(n.id) ?? false;
    const isSel = selNode?.id === n.id;
    if (dense && !isSel && !isLit) continue;
    const lines: LabelLine[] = wrapLabel(plainName(n)).map((t) => ({ t, k: 'label' }));
    const st = n.region ? regions[n.region] : null;
    if (isWhere(n) && st && st !== 'green') lines.push({ t: CREW_WORD[st], k: 'strong' });
    reqs.push({
      id: n.id,
      x: p.x,
      y: p.y,
      below: radiusOf(n) + (isWhere(n) ? 6 : 0),
      lines,
      fs,
      priority: (isSel ? 0 : isLit ? 10 : 20) + (n.kind === 'body' ? 0 : p.ring),
      outward: n.kind === 'body',
    });
  }
  const labels = placeLabels(reqs, obstacles, { w: (room / 2 + 12) / scale, h: (size.h / 2 - 6) / scale });

  const dayKey = (ev: React.KeyboardEvent) => {
    const d = ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? day - 1 : ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? day + 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? lastDay : null;
    if (d === null) return;
    ev.preventDefault();
    setPlaying(false);
    jump(d);
  };

  return (
    <div className="dca-root" style={{ ['--left-w' as string]: `${leftW - 32}px`, ['--sheet-w' as string]: `${sheetW}px` }}>
      <div className="dca-stage" ref={stageRef}>
        {/* Left: who, and which metric to trace. First in the tab order. */}
        <div className="dca-left">
          <p className="dca-brand">
            e<sup>x</sup> Crew Station
          </p>
          <h1 className="dca-title">Data system</h1>
          <div className="dca-crew">
            {file.crew.map((c) => (
              <button key={c.id} className={`dca-crewbtn dca-press${c.id === crew.id ? ' is-on' : ''}`} aria-label={c.name} aria-pressed={c.id === crew.id} onClick={() => setCrew(c.id)}>
                {initials(c.name)}
                <StatusShape status={regionStatus(replay.scoresOn(c.id, day), file.metrics).overall} size={12} />
              </button>
            ))}
          </div>
          <p className="dca-cap dca-h">
            <span>Trace a metric</span>
            <span>Day {day + 1}</span>
          </p>
          <div className="dca-list">
            {shown.map((k) => {
              const s = scoreOf(k);
              const on = selMetric === k;
              return (
                <button
                  key={k}
                  className={`dca-row dca-press${on ? ' is-on' : ''}${!on && autoKey === k ? ' is-lit' : ''}`}
                  aria-pressed={on}
                  onClick={() => setSel(on ? null : { t: 'metric', key: k })}
                >
                  <StatusShape status={s?.status ?? 'green'} size={14} />
                  <span className="grow">
                    {rowName[k]}
                    {s && s.status !== 'green' && <em>{CREW_WORD[s.status]}</em>}
                  </span>
                  <span className="val">
                    {s ? s.value : '·'}
                    <span className="unit">{file.metrics[k].unit}</span>
                  </span>
                </button>
              );
            })}
            {metricKeys.length > shown.length || allRows ? (
              <button className="dca-row dca-more dca-press" aria-expanded={allRows} onClick={() => setAllRows((v) => !v)}>
                <span className="grow">{allRows ? 'Flagged first' : `All ${metricKeys.length}`}</span>
              </button>
            ) : null}
          </div>
          {team && (
            <>
              <div className="dca-seg-ctl" role="group" aria-label="Sector">
                {(['all', 'crew', 'storm'] as const).map((s) => (
                  <button key={s} className="dca-press" aria-pressed={sector === s} onClick={() => setSector(s)}>
                    {cap(s)}
                  </button>
                ))}
              </div>
              <div className="dca-seg-ctl" role="group" aria-label="Stage">
                {(['build', 'runtime'] as const).map((s) => (
                  <button key={s} className="dca-press" aria-pressed={stage === s} onClick={() => setStage(stage === s ? null : s)}>
                    {cap(s)}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            className="dca-team dca-press"
            aria-pressed={team}
            onClick={() => {
              if (team) {
                setSector('all');
                setStage(null);
              }
              setTeam(!team);
            }}
          >
            <span>Team view</span>
            <span className="dca-cap">{team ? `${LINEAGE.meta.counts.nodes} nodes · ${LINEAGE.meta.counts.edges} links` : 'Off'}</span>
          </button>
        </div>

        {/* Right: the replay clock that drives every number and packet. */}
        <div className={`dca-right${open || rightW === 0 ? ' is-hidden' : ''}`} aria-hidden={open}>
          {building ? (
            <>
              <p className="dca-cap">Build</p>
              <p className="dca-buildnote">Before the app loads. No clock.</p>
            </>
          ) : (
            <>
              <p className="dca-cap dca-between">
                <span>Replay</span>
                <span>{date}</span>
              </p>
              <p className="dca-num">
                {day + 1}
                <span className="unit">of {replay.dates.length} days</span>
              </p>
              <div className="dca-ctl">
                <button
                  className="dca-sq dca-press"
                  aria-label="Previous day"
                  disabled={day <= 0}
                  onClick={() => {
                    setPlaying(false);
                    jump(day - 1);
                  }}
                >
                  <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
                    <path d="M-7 0h14" />
                  </svg>
                </button>
                <button
                  className="dca-sq dca-press"
                  aria-label="Next day"
                  disabled={day >= lastDay}
                  onClick={() => {
                    setPlaying(false);
                    jump(day + 1);
                  }}
                >
                  <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
                    <path d="M-7 0h14M0 -7v14" />
                  </svg>
                </button>
                <button
                  className="dca-sq dca-play dca-press"
                  onClick={() => {
                    if (!playing && day >= lastDay) jump(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
              </div>
              <svg
                className="dca-strip"
                viewBox={`0 0 ${replay.dates.length * 4} 72`}
                preserveAspectRatio="none"
                role="slider"
                tabIndex={0}
                aria-label="Mission day"
                aria-valuemin={1}
                aria-valuemax={replay.dates.length}
                aria-valuenow={day + 1}
                aria-valuetext={dayLine}
                onKeyDown={dayKey}
                onPointerDown={(ev) => {
                  const box = ev.currentTarget.getBoundingClientRect();
                  setPlaying(false);
                  jump(Math.floor(((ev.clientX - box.left) / box.width) * replay.dates.length));
                }}
              >
                {replay.dates.map((d, i) => {
                  const s: Status = replay.dayStatus[i];
                  const h = s === 'red' ? 34 : s === 'amber' ? 24 : 10;
                  const fill = s === 'red' ? 'var(--c-crit)' : s === 'amber' ? 'var(--c-warn)' : 'var(--ink-3)';
                  return (
                    <g key={d} opacity={i <= day ? 1 : 0.4}>
                      <rect x={i * 4 + 1} y={50 - h} width={2} height={h} fill={fill} />
                      {replay.dayAlert[i] !== 'none' && <rect x={i * 4 + 0.5} y={56} width={3} height={4} fill={replay.dayAlert[i] === 'warning' ? 'var(--c-crit)' : 'var(--c-warn)'} />}
                    </g>
                  );
                })}
                <rect x={day * 4 + 1} y={6} width={2} height={58} fill="var(--blue)" />
              </svg>
              <p className="dca-tally">
                {(['observation', 'flag', 'alert', 'report'] as const).map((k) => (
                  <span key={k}>
                    <b>{num(busCount(k))}</b> {k === 'observation' ? 'readings' : `${k}s`}
                  </span>
                ))}
              </p>
            </>
          )}
          <div className="dca-spacer" />
          <div className="dca-legend">
            {STATUSES.map((s) => (
              <div key={s}>
                <LineSwatch status={s} />
                {STATUS_WORD[s]}
              </div>
            ))}
          </div>
        </div>

        <svg className="dca-map" role="group" aria-label="Data system map">
          <g className="dca-cam" style={{ transform: `translate(${cx}px, ${cy}px) scale(${scale})` }}>
            {/* Sector hairline: Crew above, Storm below. */}
            <line className="dca-sector" x1={-42} y1={0} x2={rimOutside ? -RADII[5] - 110 : -RADII[5] - 14} y2={0} />
            {RADII.slice(1).map((r, i) => (
              <circle key={r} r={r} pathLength={1} className={`dca-ring${sel?.t === 'ring' && sel.ring === i + 1 ? ' is-sel' : ''}`} style={{ animationDelay: `${i * 80}ms` }} transform="rotate(180)" />
            ))}
            <g className="dca-fadein">
              {EDGES.map((e, i) => {
                const off = dim(e.from) || dim(e.to) || (stage !== null && edgeStage(e) !== stage);
                if (TRUNK.has(i)) return <path key={i} d={ROUTES[i].d} className={`dca-trunk dca-st-${e.status}${off ? ' is-off' : ''}`} />;
                return ROUTES[i].spoke ? <path key={i} d={ROUTES[i].spoke as string} className={`dca-spoke dca-st-${e.status}${off ? ' is-off' : ''}`} /> : null;
              })}
              {seg}
              {hl}
              {leader}
              <g>
                {Array.from({ length: POOL * 3 }, (_, i) => (
                  <circle key={i} r={4} ref={(el) => (dots.current[i] = el)} style={{ display: 'none' }} />
                ))}
              </g>

              {RADII.slice(1).map((r, i) => (
                <g
                  key={r}
                  className="dca-ringbtn"
                  transform={`translate(${-r + 14} ${fs + 4})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ring ${i + 1}, ${RING_NAMES[i + 1]}`}
                  aria-pressed={sel?.t === 'ring' && sel.ring === i + 1}
                  onClick={() => setSel({ t: 'ring', ring: i + 1 })}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setSel({ t: 'ring', ring: i + 1 });
                    }
                  }}
                >
                  <circle r={Math.min(38, 32 / scale)} fill="transparent" />
                  <text className="dca-ringnum" style={{ fontSize: fs }} dy={fs * 0.35}>
                    {i + 1}
                  </text>
                </g>
              ))}
              {rimOutside ? (
                <>
                  <text className="dca-rimtext" x={-RADII[5] - 26} y={-26} textAnchor="end">
                    Crew
                    <tspan x={-RADII[5] - 26} dy={16}>
                      simulated
                    </tspan>
                  </text>
                  <text className="dca-rimtext" x={-RADII[5] - 26} y={22} textAnchor="end">
                    Storm
                    <tspan x={-RADII[5] - 26} dy={16}>
                      real DONKI
                    </tspan>
                  </text>
                </>
              ) : (
                <>
                  <text className="dca-rimtext" style={{ fontSize: fs }} x={(-RADII[5] - RADII[4]) / 2 + 8} y={-fs * 0.7} textAnchor="middle">
                    Crew
                  </text>
                  <text className="dca-rimtext" style={{ fontSize: fs }} x={(-RADII[5] - RADII[4]) / 2 + 8} y={fs * 2.6 + 6} textAnchor="middle">
                    Storm
                  </text>
                </>
              )}

              {NODES.map((n) => {
                const p = PLACED[n.id];
                const isSel = selNode?.id === n.id;
                const isLit = litNodes?.has(n.id) ?? false;
                const off = dim(n.id);
                const centre = p.ring === 0;
                const body = n.kind === 'body';
                const where = isWhere(n);
                const st: Status | null = body && n.region ? regions[n.region] : null;
                const R = radiusOf(n);
                const c = count(n.id);
                const showCount = counted(n);
                return (
                  <g key={n.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                    <g
                      className={`dca-node st-${n.status}${body ? ' is-body' : ''}${isSel ? ' is-sel' : ''}${isLit ? ' is-on' : ''}${off ? ' is-dim' : ''}${where ? ` is-where dca-tone-${st}` : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${plainName(n)}, ${st ? CREW_WORD[st] : STATUS_WORD[n.status]}`}
                      aria-pressed={isSel}
                      onClick={() => pick(n.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          pick(n.id);
                        }
                      }}
                    >
                      <circle r={body ? Math.min(hitR, 24) : hitR} fill="transparent" />
                      {centre ? (
                        <>
                          <circle r={34} className="dca-core" />
                          <text className="dca-coretext" y={8} x={-3}>
                            e
                            <tspan dy={-10} fontSize={16}>
                              x
                            </tspan>
                          </text>
                        </>
                      ) : (
                        <>
                          {where && <circle r={R + 6} className="dca-where" />}
                          <circle r={R} className={`dca-disc dca-st-${n.status}`} />
                          <g className="dca-icon">
                            <KindIcon kind={n.kind} region={n.region} />
                          </g>
                          {st && st !== 'green' && !off && (
                            <g className={`dca-badge dca-shape dca-${st}`} transform={`translate(${R * 0.74} ${-R * 0.74})`}>
                              <circle r={7.5} className="dca-badge-bg" />
                              <StatusMark status={st} size={11} />
                            </g>
                          )}
                        </>
                      )}
                      {showCount && (
                        <text className="dca-count" style={{ fontSize: fs }} x={centre ? 0 : R + 7} y={centre ? R + 6 + fs * 0.85 : fs * 0.35} textAnchor={centre ? 'middle' : 'start'}>
                          {num(c)}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}
              <g className="dca-labels">
                {labels.map((l) => {
                  const n = NODE_BY_ID[l.id];
                  const on = selNode?.id === l.id || (litNodes?.has(l.id) ?? false);
                  return (
                    <text key={l.id} className={`dca-label${on ? ' is-on' : ''}${n.status === 'planned' ? ' is-planned' : ''}`} style={{ fontSize: l.fs }} textAnchor={l.anchor}>
                      {l.lines.map((line, j) => (
                        <tspan key={j} x={l.x} y={l.y + j * l.lh} className={line.k === 'strong' ? 'is-status' : undefined}>
                          {line.t}
                        </tspan>
                      ))}
                    </text>
                  );
                })}
              </g>
            </g>
          </g>
        </svg>

        {/* Detail sheet: rises from the lower edge, docked right so the whole map stays in view. */}
        <section className={`dca-sheet${open ? ' is-open' : ''}`} aria-hidden={!open}>
          {sheet}
          <div className="dca-sheet-foot">
            <button className="dca-sq dca-press" onClick={() => step(-1)}>
              Prev
            </button>
            <button className="dca-sq dca-press" onClick={() => step(1)}>
              Next
            </button>
            {primary}
          </div>
        </section>
      </div>
      <Footer className="dca-footer" />
    </div>
  );
}
