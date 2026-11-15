// Flight Record, chapter 04 "Record": the data system told as the life of one
// reading. The line on the page is the path that reading takes, from its source
// to the flight surgeon; the body beside it shows where the reading sits.
// Graph: docs/lineage.json. Values: crew_data.json and storm_forecast.json
// replayed through core/scoring. Nothing here repeats a number from the files.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { AMBER_Z, regionStatus } from '../../core/scoring';
import { seriesToObservations } from '../../core/observation';
import type { MetricKey, Region, Status } from '../../data/types';
import {
  DASH,
  GEO,
  GRAPH,
  LAYERS,
  NODE,
  STATUS_SHORT,
  STATUS_WORD,
  alertStatus,
  branchesOn,
  buildReplay,
  carriers,
  clip,
  countsAt,
  downstream,
  fmt,
  hopStatus,
  layout,
  ownerMark,
  pathFor,
  stormPick,
  textWidth,
  tracePath,
  upstream,
  type Branch,
  type NodeStatus,
  type Pt,
  type ReadingKey,
} from './record-model';
import { Body, Boundary, Figure, REGION_NAME, STATUS_LABEL, Shape, Strip, Swatch, TONE, type StripPoint } from './parts';
import './record.css';

const ESCALATION: Record<Status, string> = {
  green: 'Self-care, nobody is told',
  amber: 'Flag for the next medical conference',
  red: 'Crew medical officer now, report to flight surgeon queued',
};
const RANK: Record<Status, number> = { green: 0, amber: 1, red: 2 };
/** Presentation only: how much history the strip and the packets replay, and the pace. */
const WINDOW = 14;
const TICK_MS = 1200;
const DWELL_MS = 2600;
const HOP_MS = 500;
const TAP_MS = 160;

const query = () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const two = (n: number) => String(n).padStart(2, '0');

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
  // The marker walks by itself only until the first touch. After that it moves on Play.
  const [playing, setPlaying] = useState(
    () => !(init.has('hold') || init.has('sel') || init.has('at') || init.has('index') || init.has('open') || reducedMotion()),
  );
  const [showIndex, setShowIndex] = useState(init.has('index'));
  const [layerTab, setLayerTab] = useState(init.get('layer') ?? '0');
  const [open, setOpen] = useState<string | null>(init.get('open'));
  const [tab, setTab] = useState<string | null>(init.get('tab'));
  const [tick, setTick] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1500, h: 560 });
  const drawn = loadState === 'ready' && !showIndex;
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [drawn]);

  useEffect(() => {
    const crewParam = init.get('crew');
    if (crewParam && data?.crew.crew.some((c) => c.id === crewParam)) setCrew(crewParam);
  }, [data, init, setCrew]);

  const replay = useMemo(
    () => (data && environment ? buildReplay(data.crew, data.storm, environment) : null),
    [data, environment],
  );

  // Packet clock: one mission day (or one flare) per tick. Counts do not follow it.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const crewIndex = data && member ? data.crew.crew.findIndex((c) => c.id === member.id) : -1;
  const todayIdx = replay && data ? Math.max(0, replay.dates.lastIndexOf(data.crew.mission.today)) : 0;
  const todayScores = useMemo(
    () => (replay && crewIndex >= 0 ? replay.scores[crewIndex][todayIdx] ?? [] : []),
    [replay, crewIndex, todayIdx],
  );

  // The reading to follow by default: the worst thing on this astronaut today.
  const flagged = useMemo(() => {
    const bad = todayScores.filter((s) => s.status !== 'green');
    bad.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.score ?? 0) - (a.score ?? 0));
    return bad[0]?.metric ?? null;
  }, [todayScores]);

  const metricKeys = data ? (Object.keys(data.crew.metrics) as MetricKey[]) : [];
  const heartKey = metricKeys.find((k) => k === 'hr') ?? metricKeys[0];
  const doseKey = metricKeys.find((k) => k === 'dose_mSv_day') ?? metricKeys[metricKeys.length - 1];
  const asked = reading === 'storm' || (reading && (metricKeys as string[]).includes(reading)) ? (reading as ReadingKey) : null;
  const key: ReadingKey = asked ?? flagged ?? heartKey ?? 'storm';
  const isStorm = key === 'storm';

  const path = useMemo(() => pathFor(key), [key]);
  const branches = useMemo(() => branchesOn(path), [path]);
  const lay = useMemo(() => layout(size.w, size.h, path, branches), [size, path, branches]);
  const trace = useMemo(() => tracePath(path, lay), [path, lay]);
  const also = useMemo(() => carriers(key), [key]);
  const atSafe = Math.min(Math.max(at, 0), path.length - 1);

  useEffect(() => {
    if (!playing) return;
    const last = atSafe >= path.length - 1;
    const t = window.setTimeout(() => {
      if (last) {
        setMoveMs(0);
        setAt(0);
      } else {
        setMoveMs(HOP_MS);
        setAt(atSafe + 1);
      }
    }, DWELL_MS);
    return () => window.clearTimeout(t);
  }, [atSafe, playing, path.length]);

  if (loadState === 'error') {
    return (
      <div className="fr fr-fail">
        <div>
          <p className="fr-label">Flight Record</p>
          <h1>The data files did not load.</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!data || !member || !environment || !replay) return <div className="fr" />;

  const crew = data.crew;
  const storm = data.storm;
  const counts = countsAt(replay, todayIdx, isStorm);

  /* ----------------------------------------------------- followed reading */
  const row = member.series[todayIdx];
  const score = !isStorm ? todayScores.find((s) => s.metric === key) : undefined;
  const mMeta = !isStorm ? crew.metrics[key] : undefined;
  const pickIdx = stormPick(replay);
  const event = replay.events[pickIdx];
  const status: Status = isStorm ? alertStatus(event) : score?.status ?? 'green';
  const regions = regionStatus(todayScores, crew.metrics);
  const value = !isStorm && row ? row[key] : null;
  const litRegion: Region = (mMeta ?? crew.metrics[doseKey]).body_region;
  const base = !isStorm ? member.baseline[key as MetricKey] : undefined;

  const stripPoints: StripPoint[] = isStorm
    ? replay.events.slice(Math.max(0, pickIdx - WINDOW + 1), pickIdx + 1).map((e) => ({ v: e.p_storm, status: alertStatus(e) }))
    : member.series.slice(Math.max(0, todayIdx - WINDOW + 1), todayIdx + 1).map((r, k, arr) => {
        const di = todayIdx - (arr.length - 1) + k;
        return { v: r[key as MetricKey], status: replay.scores[crewIndex]?.[di]?.find((s) => s.metric === key)?.status ?? 'green' };
      });

  const span = Math.max(1, Math.min(WINDOW, (isStorm ? pickIdx : todayIdx) + 1));
  const cursorOf = (n: number) => (isStorm ? pickIdx : todayIdx) - span + 1 + (((n % span) + span) % span);
  const packetStatus = (n: number, ci: number): Status => {
    const c = cursorOf(n);
    if (isStorm) return alertStatus(replay.events[c]);
    return replay.scores[ci]?.[c]?.find((s) => s.metric === key)?.status ?? 'green';
  };

  /* ------------------------------------------------------------- actions */
  const branchOf = (id: string): Branch | undefined => branches.find((b) => b.tabs.some((g) => g.nodes.includes(id)));
  const follow = (k: ReadingKey) => {
    setPlaying(false);
    setReading(k);
    setSel(null);
    setOpen(null);
    setMoveMs(0);
    setAt(0);
  };
  const select = (id: string) => {
    setPlaying(false);
    setShowIndex(false);
    const i = path.indexOf(id);
    if (i >= 0) {
      setSel(null);
      setMoveMs(TAP_MS);
      setAt(i);
      return;
    }
    const b = branchOf(id);
    if (!b) return;
    setSel(id);
    setOpen(b.id);
    setTab(b.tabs.find((g) => g.nodes.includes(id))?.id ?? null);
  };
  const stepBy = (d: number) => {
    setPlaying(false);
    setSel(null);
    setMoveMs(TAP_MS);
    setAt(Math.min(path.length - 1, Math.max(0, atSafe + d)));
  };
  const toggleBranch = (id: string) => {
    setPlaying(false);
    setOpen(open === id ? null : id);
    setTab(null);
    if (sel && branchOf(sel)?.id !== id) setSel(null);
  };
  const pickRegion = (r: Region) => {
    const inRegion = todayScores.filter((s) => crew.metrics[s.metric].body_region === r);
    inRegion.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.score ?? 0) - (a.score ?? 0));
    const m = inRegion[0]?.metric ?? metricKeys.find((k) => crew.metrics[k].body_region === r);
    if (m) follow(m);
  };
  const pickCrew = (id: string) => {
    setPlaying(false);
    setCrew(id);
    setReading(null);
    setSel(null);
    setMoveMs(0);
    setAt(0);
  };

  /* ------------------------------------------------ what a station holds */
  const selBranch = sel && NODE[sel] && !path.includes(sel) ? branchOf(sel) : undefined;
  const noteId = sel && selBranch ? sel : path[atSafe];
  const node = NODE[noteId];
  const onPath = !selBranch;
  const sample = (id: string): string | null => {
    const n = NODE[id];
    if (!n) return null;
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
      switch (id) {
        case 'ds_crew_data':
          return `crew[${crewIndex}].series[${todayIdx}].${key} = ${value}`;
        case 'ad_loader':
          return `${crew.crew.length} crew, ${member.series.length} days, ${metricKeys.length} metrics, typed from the contract`;
        case 'ad_replay':
        case 'core_observation':
          return JSON.stringify(obs);
        case 'core_bus':
          return `observation ${obs.subject}/${obs.metric}, one of ${fmt(counts.core_bus.n)} events on the bus`;
        case 'ml_crew_flags':
        case 'core_scoring':
          if (!score) return null;
          return score.z !== null && score.windowMean !== null && base
            ? `baseline ${base.mean} sd ${base.sd}, 3-day mean ${score.windowMean.toFixed(2)}, z ${score.z.toFixed(2)}: ${score.status}`
            : `value ${score.value} on absolute bands: ${score.status}`;
        case 'sf_console':
          return `${REGION_NAME[mMeta.body_region]} lit, ${STATUS_LABEL[status].toLowerCase()}. Region overall: ${STATUS_LABEL[regions[mMeta.body_region]].toLowerCase()}`;
        case 'core_escalation':
          return ESCALATION[status];
        case 'core_link':
          return `${crew.environments[environment].label}: ${status === 'red' ? 'report queued' : 'no report for this reading'}`;
        case 'sf_ground':
        case 'person_surgeon':
          return status === 'red' ? 'This reading is in the report' : `Not sent. ${fmt(counts[id].n)} ${counts[id].unit} so far this mission`;
        default:
          break;
      }
    }
    return n.samples?.[0] ?? n.path ?? n.impl ?? null;
  };

  const uniq = (ids: string[]) => [...new Set(ids)].filter((id) => NODE[id]);
  const from = uniq(upstream(noteId).map((e) => e.from));
  const to = uniq(downstream(noteId).map((e) => e.to));
  const noteSample = sample(noteId);
  const noteCount = counts[noteId];
  const openBranch = branches.find((b) => b.id === open);
  const openTab = openBranch ? openBranch.tabs.find((g) => g.id === tab) ?? openBranch.tabs[0] : undefined;

  /* -------------------------------------------- real edges of the note */
  interface Anchor {
    pt: Pt;
    st: number;
    b?: Branch;
  }
  const anchor = (id: string): Anchor | null => {
    const st = path.indexOf(id);
    if (st >= 0) return { pt: lay.pos[id], st };
    const b = branchOf(id);
    return b ? { pt: lay.title[b.id], st: -1, b } : null;
  };
  const links: { d: string; head: string; status: NodeStatus; k: string }[] = [];
  if (!showIndex) {
    const seen = new Set<string>();
    const edge = (p: Anchor, other: Pt): Pt =>
      p.st >= 0
        ? { x: p.pt.x, y: p.pt.y + (other.y < p.pt.y ? -13 : 13) }
        : { x: p.pt.x, y: p.pt.y + (p.b?.side === 'up' ? 12 : -24) };
    for (const e of [...upstream(noteId), ...downstream(noteId)]) {
      const a = anchor(e.from);
      const b = anchor(e.to);
      if (!a || !b || (a.pt.x === b.pt.x && a.pt.y === b.pt.y)) continue;
      const k = `${a.pt.x},${a.pt.y}>${b.pt.x},${b.pt.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      let p0: Pt;
      let p1: Pt;
      let c: Pt;
      if (a.st >= 0 && b.st >= 0) {
        const n = Math.abs(a.st - b.st);
        const s = Math.sign(b.pt.x - a.pt.x);
        if (n === 1) {
          p0 = { x: a.pt.x + s * 13, y: a.pt.y };
          p1 = { x: b.pt.x - s * 13, y: b.pt.y };
          c = { x: (p0.x + p1.x) / 2, y: p0.y };
        } else {
          p0 = { x: a.pt.x + s * 6, y: a.pt.y - 13 };
          p1 = { x: b.pt.x - s * 6, y: b.pt.y - 13 };
          c = { x: (p0.x + p1.x) / 2, y: p0.y - Math.min(60, 20 + n * 10) };
        }
      } else {
        p0 = edge(a, b.pt);
        p1 = edge(b, a.pt);
        const stn = a.st >= 0 ? p0 : p1;
        const ttl = a.st >= 0 ? p1 : p0;
        if (a.st < 0 && b.st < 0) c = { x: (p0.x + p1.x) / 2, y: lay.y0 - 34 };
        else if (stn.x === ttl.x) c = { x: stn.x, y: (stn.y + ttl.y) / 2 };
        else c = { x: stn.x, y: ttl.y };
      }
      const ang = Math.atan2(p1.y - c.y, p1.x - c.x);
      const wing = (t: number) => `${(p1.x - 9 * Math.cos(ang + t)).toFixed(1)} ${(p1.y - 9 * Math.sin(ang + t)).toFixed(1)}`;
      links.push({
        d: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
        head: `M${wing(0.45)} L${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L${wing(-0.45)}`,
        status: e.status,
        k,
      });
    }
  }

  const subline = isStorm ? (
    <>
      Flare <b>{event.flare_class}</b>, {event.source_location ?? 'location unknown'}, peak {event.peak_time.slice(0, 16).replace('T', ' ')} UTC
    </>
  ) : (
    <>
      <b>{member.name}</b>, {mMeta?.label.toLowerCase()}, {row?.date}
    </>
  );

  const statusOf = (k: MetricKey) => todayScores.find((s) => s.metric === k)?.status ?? null;
  const segs: { k: ReadingKey | null; title: string; st: Status | null }[] = [
    { k: flagged, title: 'Flagged', st: flagged ? statusOf(flagged) : null },
    { k: heartKey, title: 'Heart rate', st: statusOf(heartKey) },
    { k: doseKey, title: 'Dose', st: statusOf(doseKey) },
    { k: 'storm', title: 'Storm', st: alertStatus(event) },
  ];
  const activeSeg = key === flagged ? 0 : segs.findIndex((s, i) => i > 0 && s.k === key);
  const footer = [...DISCLAIMERS, `Space weather data: ${storm.meta.data_credit}`, `Model: ${storm.meta.model}`];
  const clock = isStorm
    ? `${fmt(replay.events.length)} flares in file, ${fmt(counts.core_radiation.n)} alerts, ${storm.meta.test_period.join(' to ')}`
    : `Mission day ${todayIdx + 1}, ${replay.dates[todayIdx]}`;

  const nameY = (i: number) => (lay.stagger && i % 2 === 1 ? GEO.name2 : GEO.name);
  const relation = (b: Branch) =>
    b.at < 0 ? 'No link to this line' : `${b.side === 'up' ? 'Feeds' : 'Fed by'} ${two(b.at + 1)} ${NODE[path[b.at]].label}`;

  return (
    <div className="fr" data-storm={isStorm}>
      {/* ------------------------------------------------------------ top strip */}
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
          <span className="key">
            <i>T</i> Tomas <i>E</i> Emile <i>X</i> External
          </span>
        </div>
        <div className="fr-clock fr-mono">{clock}</div>
      </header>

      {/* ----------------------------------------------------------- headline */}
      <section className="fr-head">
        <div className="fr-index">
          <span className="fr-mono">04 / 04</span>
          <span className="fr-label">Record</span>
        </div>
        <h1 className="fr-h1">The life of one reading.</h1>
        <p className="fr-sub">{subline}</p>
      </section>

      {/* --------------------------------------------------------------- body */}
      <aside className="fr-side" aria-label="Where in the body">
        <div className="fr-hero">
          <div className="fr-label">{isStorm ? 'Storm probability' : mMeta?.label}</div>
          <div className="fr-hero-num">
            {isStorm ? event.p_storm.toFixed(3) : value ?? 'none'}
            <span>{isStorm ? `within ${storm.meta.horizon_hours} h` : mMeta?.unit}</span>
          </div>
          <div className="fr-hero-status">
            <Shape status={status} size={14} />
            <b>{STATUS_LABEL[status]}</b>
            {!isStorm && score?.z != null && <span>z {score.z.toFixed(2)}, own baseline</span>}
            {isStorm && <span>{event.actual_storm ? `${event.alert_level}, particles arrived` : event.alert_level}</span>}
          </div>
        </div>
        <div className="fr-trend">
          <Strip
            points={stripPoints}
            status={status}
            band={base ? [base.mean - AMBER_Z * base.sd, base.mean + AMBER_Z * base.sd] : null}
            lines={
              isStorm
                ? [
                    { v: storm.meta.thresholds.watch, label: 'watch' },
                    { v: storm.meta.thresholds.warning, label: 'warning' },
                  ]
                : []
            }
          />
          <p>
            {isStorm
              ? `Last ${stripPoints.length} flares, model thresholds`
              : base
                ? `${stripPoints.length} days on own band, ${base.mean} ± ${AMBER_Z} sd`
                : `${stripPoints.length} days, judged on absolute bands`}
          </p>
        </div>
        <Body regions={regions} lit={litRegion} litStatus={status} onPick={pickRegion} />
      </aside>

      {showIndex ? (
        /* ------------------------------------------------------------ index */
        <section className="fr-table">
          <div className="fr-layers" role="tablist">
            {Object.entries(LAYERS).map(([layer, label]) => (
              <button key={layer} role="tab" aria-selected={layer === layerTab} onClick={() => setLayerTab(layer)}>
                <span className="fr-mono">
                  {two(Number(layer) + 1)} · {GRAPH.nodes.filter((n) => String(n.layer) === layer).length}
                </span>
                <b>{label}</b>
              </button>
            ))}
          </div>
          <div className="fr-rows" key={layerTab}>
            {GRAPH.nodes
              .filter((n) => String(n.layer) === layerTab)
              .map((n, i) => (
                <button key={n.id} aria-pressed={n.id === noteId} style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }} onClick={() => select(n.id)}>
                  <Swatch status={n.status} w={26} />
                  <b>{n.label}</b>
                  <span>{STATUS_WORD[n.status]}</span>
                  <span className="fr-mono">{ownerMark(n.owner)}</span>
                  <span className="fr-mono r">{counts[n.id] ? fmt(counts[n.id].n) : ''}</span>
                </button>
              ))}
          </div>
        </section>
      ) : (
        <>
          {/* ------------------------------------------------- station record */}
          <section className="fr-note">
            <div className="fr-note-in" key={noteId}>
              <div className="who">
                <div className="fr-mono id">
                  {onPath ? `${two(path.indexOf(noteId) + 1)} / ${two(path.length)}` : `${selBranch?.title}, off the line`}
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

              <div className="holds">
                <div className="fr-label">{onPath ? 'The reading here' : 'Sample'}</div>
                <div className="sample-row">
                  {noteId === 'sf_console' && (
                    <div className="mini">
                      <Figure regions={regions} lit={litRegion} litStatus={status} />
                    </div>
                  )}
                  {noteSample ? <p className="sample">{noteSample}</p> : <p className="sample none">No sample for this reading</p>}
                </div>
                <p className="src">{node.source}</p>
              </div>

              <div className="flow">
                <div className="fr-label">From</div>
                <div className="chips">
                  {from.length ? (
                    from.slice(0, 3).map((id) => (
                      <button key={id} onClick={() => select(id)}>
                        {NODE[id].label}
                      </button>
                    ))
                  ) : (
                    <em>Start of the record</em>
                  )}
                  {from.length > 3 && <em>+{from.length - 3}</em>}
                </div>
                <div className="fr-label">To</div>
                <div className="chips">
                  {to.length ? (
                    to.slice(0, 3).map((id) => (
                      <button key={id} onClick={() => select(id)}>
                        {NODE[id].label}
                      </button>
                    ))
                  ) : (
                    <em>End of the record</em>
                  )}
                  {to.length > 3 && <em>+{to.length - 3}</em>}
                </div>
              </div>

              <dl className="more">
                <dt className="fr-label">Carries</dt>
                <dd className="fr-mono">{node.fields.join(', ')}</dd>
                <dt className="fr-label">Cadence</dt>
                <dd>{node.cadence}</dd>
                <dt className="fr-label">Licence</dt>
                <dd>{node.license ?? 'None stated'}</dd>
              </dl>
            </div>
          </section>

          {/* ---------------------------------------------------------- trace */}
          <section className="fr-stage" ref={stageRef}>
            <svg width={lay.w} height={lay.h} role="group" aria-label="The path this reading takes">
              {/* record gate: ties the record above to the station it describes */}
              {onPath && <line className="fr-gate" x1={lay.pos[noteId].x} x2={lay.pos[noteId].x} y1={0} y2={lay.y0 - 20} />}

              {/* hops */}
              {path.slice(1).map((id, i) => {
                const a = lay.pos[path[i]];
                const b = lay.pos[id];
                const done = i < atSafe;
                return (
                  <line
                    key={id}
                    className="fr-hop"
                    data-done={done}
                    x1={a.x + 11}
                    y1={a.y}
                    x2={b.x - 11}
                    y2={b.y}
                    strokeDasharray={DASH[hopStatus(path[i], id)]}
                  />
                );
              })}

              {/* branches: one stem each, to the station the edges say it feeds or is fed by */}
              {branches.map((b) => {
                const t = lay.title[b.id];
                const isOpen = open === b.id;
                const up = b.side === 'up';
                const s = b.at >= 0 ? lay.pos[path[b.at]] : null;
                const y1 = s ? s.y + (up ? -13 : nameY(b.at) + (lay.stagger ? 14 : 32)) : 0;
                const yT = t.y + (up ? 12 : -24);
                const yMid = (y1 + yT) / 2;
                const more = b.tabs.slice(1).map((g) => g.title);
                const w = Math.max(96, Math.min(lay.step - 8, 190));
                const label = clip(b.title, Math.max(6, Math.floor((w - 30) / 9.6)));
                return (
                  <g key={b.id} className="fr-branch" data-open={isOpen}>
                    {s && (
                      <path
                        className="stem"
                        strokeDasharray={DASH[b.status]}
                        d={t.x === s.x ? `M${s.x} ${y1} L${t.x} ${yT}` : `M${s.x} ${y1} L${s.x} ${yMid} L${t.x} ${yMid} L${t.x} ${yT}`}
                      />
                    )}
                    {s && <path className="tick" d={`M${s.x - 5} ${(up ? y1 - 9 : y1 + 6) - 3} l5 6 l5 -6`} />}
                    <rect className="fr-hit" x={t.x - w / 2} y={up ? t.y - 50 : t.y - 24} width={w} height={72} onClick={() => toggleBranch(b.id)}>
                      <title>
                        {isOpen ? 'Fold' : 'Open'} {b.title}
                      </title>
                    </rect>
                    <g pointerEvents="none">
                      <text x={t.x} y={t.y} textAnchor="middle" className="t-title">
                        {label}
                        <tspan className="t-mono" dx={7}>
                          {b.total}
                        </tspan>
                      </text>
                      {more.length > 0 && (
                        <text x={t.x} y={t.y + (up ? -21 : 21)} textAnchor="middle" className="t-more">
                          {clip(`with ${more.join(', ')}`, Math.floor(Math.max(w, lay.step * 1.5) / 7.8))}
                        </text>
                      )}
                      <line className="under" x1={t.x - w / 2 + 10} x2={t.x + w / 2 - 10} y1={t.y + 7} y2={t.y + 7} />
                    </g>
                  </g>
                );
              })}

              {/* real edges of the selected node */}
              {links.map((l) => (
                <g key={l.k} className="fr-link">
                  <path d={l.d} strokeDasharray={DASH[l.status]} />
                  <path d={l.head} />
                </g>
              ))}

              {/* replay packets: one per crew member per mission day, or one per flare */}
              {[tick - 2, tick - 1, tick].flatMap((n, gi) =>
                (isStorm ? [0] : crew.crew.map((_, ci) => ci)).map((ci) => {
                  const st = packetStatus(n, ci);
                  const c = st === 'green' ? 'var(--paper)' : TONE[st];
                  return (
                    <g
                      key={`${key}-${n}-${ci}`}
                      className="fr-pkt"
                      style={{ offsetPath: `path('${trace.d}')`, animationDelay: `${ci * 240}ms`, ['--rest' as string]: `${12 + gi * 30 + ci * 7}%` }}
                    >
                      <line x1={-18} x2={0} y1={0} y2={0} stroke={c} strokeWidth={2} strokeOpacity={0.45} />
                      <circle r={3} fill={c} />
                    </g>
                  );
                }),
              )}

              {/* stations */}
              {path.map((id, i) => {
                const n = NODE[id];
                const p = lay.pos[id];
                const chosen = id === noteId;
                const c = counts[id];
                const name = clip(n.label, lay.maxChars);
                const nw = textWidth(name, lay.nameSize);
                const hw = Math.max(72, Math.min(lay.step, 160));
                const tag = [two(i + 1), STATUS_SHORT[n.status], lay.step >= 120 ? ownerMark(n.owner) : ''].filter(Boolean).join(' ');
                return (
                  <g key={id} className="fr-station" data-on={chosen} data-past={i <= atSafe}>
                    <rect className="fr-hit" x={p.x - hw / 2} y={p.y - 26} width={hw} height={nameY(i) + 40} onClick={() => select(id)}>
                      <title>{n.label}</title>
                    </rect>
                    <g pointerEvents="none">
                      <circle className="dot" cx={p.x} cy={p.y} r={10} />
                      <text x={p.x} y={p.y + GEO.num} textAnchor="middle" className="t-mono">
                        {tag}
                      </text>
                      <text x={p.x} y={p.y + nameY(i)} textAnchor="middle" className="t-name" style={{ fontSize: lay.nameSize }}>
                        {name}
                      </text>
                      <line className="under" x1={p.x - nw / 2} x2={p.x + nw / 2} y1={p.y + nameY(i) + 8} y2={p.y + nameY(i) + 8} />
                      {c && !lay.stagger && (
                        <text x={p.x} y={p.y + GEO.count} textAnchor="middle" className="t-mono t-count">
                          {fmt(c.n)} {c.unit}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}

              {/* the reading itself */}
              <g
                className="fr-marker"
                data-status={status}
                pointerEvents="none"
                style={{ offsetPath: `path('${trace.d}')`, offsetDistance: `${trace.stops[atSafe]}px`, transitionDuration: `${moveMs}ms` }}
              >
                <circle className="ring" r={17} stroke={status === 'green' ? 'var(--paper)' : TONE[status]} />
                <circle r={6} fill={status === 'green' ? 'var(--paper)' : TONE[status]} />
              </g>
            </svg>

            {/* open branch */}
            {openBranch && openTab && (
              <div className="fr-tray">
                <div className="fr-tray-head">
                  <b className="fr-label">{openBranch.title}</b>
                  <span>{relation(openBranch)}</span>
                  <div className="tabs">
                    {openBranch.tabs.length > 1 &&
                      openBranch.tabs.map((g) => (
                        <button key={g.id} aria-pressed={g.id === openTab.id} onClick={() => setTab(g.id)}>
                          {g.title} <span className="fr-mono">{g.nodes.length}</span>
                        </button>
                      ))}
                  </div>
                  <button className="fold" onClick={() => toggleBranch(openBranch.id)}>
                    Fold
                  </button>
                </div>
                <div className="fr-tray-leaves" key={openTab.id} style={{ gridTemplateColumns: `repeat(${Math.max(openTab.nodes.length, 4)}, minmax(0, 1fr))` }}>
                  {openTab.nodes.map((id, i) => {
                    const n = NODE[id];
                    const rel = from.includes(id) ? 'from' : to.includes(id) ? 'to' : '';
                    return (
                      <button key={id} aria-pressed={id === noteId} data-carries={also.has(id)} style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }} onClick={() => select(id)}>
                        <b>{n.label}</b>
                        <span>
                          <Swatch status={n.status} w={22} />
                          {STATUS_WORD[n.status]}
                          <i className="fr-mono">{ownerMark(n.owner)}</i>
                          {rel && <i className="fr-mono rel">{rel}</i>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ----------------------------------------------------------------- bar */}
      <nav className="fr-bar" aria-label="Controls">
        <div className="grp crew" aria-label="Crew">
          {crew.crew.map((c, ci) => {
            const st = regionStatus(replay.scores[ci][todayIdx] ?? [], crew.metrics).overall;
            return (
              <button key={c.id} aria-pressed={c.id === member.id} onClick={() => pickCrew(c.id)}>
                <Shape status={st} />
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
        <div className="grp follow" aria-label="Reading to follow">
          {segs.map((s, i) => (
            <button key={s.title} aria-pressed={i === activeSeg} disabled={s.k === null} onClick={() => s.k && follow(s.k)}>
              {s.st && <Shape status={s.st} />}
              <span>{s.title}</span>
            </button>
          ))}
        </div>
        <div className="grp nav">
          <button
            aria-pressed={showIndex}
            onClick={() => {
              setPlaying(false);
              setShowIndex(!showIndex);
            }}
          >
            <span>All {GRAPH.nodes.length}</span>
          </button>
          <button className="sq" onClick={() => stepBy(-1)} disabled={showIndex || atSafe === 0} aria-label="Previous station">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M12.5 4 6.5 10l6 6" />
            </svg>
            Prev
          </button>
          <button
            className="sq"
            aria-pressed={playing}
            disabled={showIndex}
            onClick={() => {
              setSel(null);
              setPlaying(!playing);
            }}
            aria-label={playing ? 'Hold the marker' : 'Play the walk'}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              {playing ? <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" /> : <path d="M6 3.5 16 10 6 16.5z" />}
            </svg>
            {playing ? 'Hold' : 'Play'}
          </button>
          <button className="next" onClick={() => stepBy(1)} disabled={showIndex || atSafe === path.length - 1} aria-label="Next station">
            Next
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M7.5 4l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="fr-progress" style={{ transform: `scaleX(${path.length > 1 ? atSafe / (path.length - 1) : 0})` }} />
      </nav>

      <footer className="fr-foot">
        <p>
          {footer.map((f, i) => (
            <span key={f}>
              {i > 0 && ' · '}
              {f}
            </span>
          ))}
          <span>
            {' · '}
            {GRAPH.meta.counts.nodes} nodes, {GRAPH.meta.counts.edges} links
          </span>
        </p>
        <p>{ANATOMY_CREDIT}</p>
      </footer>
    </div>
  );
}

export default function FlightRecord() {
  return (
    <Boundary>
      <Record />
    </Boundary>
  );
}
