// Cockpit Glass, data architecture map: the lineage drawn as a signal schematic
// with one central bus rail. Nodes and edges come from docs/lineage.json; the
// packets and node counts come from replaying the two data files through core scoring.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import {
  AMBER_Z, BONE_LOSS_AMBER_PCT, DOSE_CUM_AMBER_FRACTION, DOSE_DAY_AMBER_FACTOR, RED_Z,
  contextFor, dayIndex, regionStatus, scoreDay, scoreMetric, statusOn, type MetricScore,
} from '../../core/scoring';
import { createBus, type AnyRecord, type CoreEvents } from '../../core/bus';
import { toFhir } from '../../core/observation';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
import type { ConceptMeta } from '../../registry';
import { REGIONS, type CrewMember, type EnvironmentId, type FlareEvent, type MetricKey, type MissionData, type Region, type Status } from '../../data/types';
import {
  BUS_ID, CHAINS, COLUMNS, EDGES, GATE_ID, HEADER_H, LINEAGE, MIN_W, NODE, NODES, NODE_H, REPLAY_EDGES, REPLAY_NODES, SLOT_INDEX,
  breadcrumb, computeLayout, edgeKey, focusOfMetric, focusOfNode, incoming, isBuildEdge, isBuildNode, outgoing, slotOf,
  type Focus, type LNode, type LStatus, type Layout,
} from './graph';
import { createReplay, type Replay } from './replay';
import { BodyFigure, REGION_WORD, STATUS_WORD, Shape, StatusGlyph, breakable, initials, plainName, shortLabel } from './parts';
import './arch.css';

export const meta: ConceptMeta = {
  title: 'Signal Schematic',
  direction: 'Cockpit Glass',
  surface: 'architecture',
};

type Selection = { type: 'node' | 'metric'; id: string } | null;
type Stage = 'runtime' | 'build';
type ChainFilter = 'all' | 'crew' | 'storm';

const STATUS_LABEL: Record<LStatus, string> = {
  live: 'Live',
  simulated: 'Simulated',
  planned: 'Planned',
  'offline-sample': 'Offline sample',
};
const STATUS_ORDER: LStatus[] = ['live', 'simulated', 'planned', 'offline-sample'];
/** The replay loops over the last days of the mission, so a judge meets a flag within seconds. */
const LOOP_DAYS = 7;
/** BUILD-KICKOFF section 1: the positioning line, required on this screen. */
const POSITIONING = ['CMO-DA answers when the crew asks. e', 'x', ' tells them when to ask.'] as const;
const BODY_CONCEPT = 'cockpit-glass-body';
const fmt = (n: number): string => n.toLocaleString('en-US');
const baseName = (p: string): string => p.split(' ')[0].split('/').pop() ?? p;

function describe(rec: AnyRecord<CoreEvents>): string {
  switch (rec.type) {
    case 'observation':
      return `${rec.payload.subject} ${rec.payload.metric} ${rec.payload.value ?? ''}`;
    case 'flag':
      return `${rec.payload.subject} ${rec.payload.metric} ${rec.payload.severity}`;
    case 'status':
      return `${rec.payload.subject} ${rec.payload.overall}`;
    case 'alert':
      return `${rec.payload.level} ${rec.payload.message}`;
    case 'report':
      return `${rec.payload.id} ${rec.payload.bytes} B`;
    default:
      return '';
  }
}

/** A value for the panel, read from the real data files (never typed in here). */
function sampleFor(n: LNode, data: MissionData, member: CrewMember, scores: MetricScore[], busCount: number, today: string): { value: string; from: string } | null {
  const metricLine = (k: MetricKey): string | null => {
    const s = scores.find((x) => x.metric === k);
    return s ? `${data.crew.metrics[k].label} ${s.value} ${data.crew.metrics[k].unit}` : null;
  };
  if (n.id === BUS_ID) return { value: `${fmt(busCount)} events`, from: 'this replay' };
  if (n.id === GATE_ID) {
    const s = scores[0];
    if (!s) return null;
    const obs = { subject: member.id, metric: s.metric, value: s.value, unit: data.crew.metrics[s.metric].unit, time: today, source: 'replay:crew_data.json' };
    return { value: JSON.stringify(toFhir(obs).valueQuantity) + ` ${s.metric}`, from: 'toFhir(), core/observation.ts' };
  }
  if (n.path?.endsWith('storm_forecast.json') || n.id === 'core_radiation') {
    const e = [...data.storm.events].sort((a, b) => a.peak_time.localeCompare(b.peak_time)).pop();
    return e ? { value: `${e.flare_class} · p ${e.p_storm} · ${e.alert_level}`, from: `storm_forecast.json, ${e.peak_time.slice(0, 10)}` } : null;
  }
  if (n.path?.endsWith('real_crew.json')) {
    return data.real ? { value: `${data.real.meta.source} · ${data.real.meta.mission}`, from: 'real_crew.json meta' } : null;
  }
  if (n.id === 'core_scoring') {
    const s = [...scores].filter((x) => x.z !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    return s ? { value: `${s.metric} z ${(s.z as number).toFixed(2)} · ${s.status}`, from: `scoreDay(), ${member.id} ${today}` } : null;
  }
  const keys = [...(n.metric_keys ?? []), ...n.fields, ...(n.maps_to ?? [])].filter((k): k is MetricKey => k in data.crew.metrics);
  for (const k of keys) {
    const line = metricLine(k);
    if (line) return { value: line, from: `crew_data.json, ${member.id} ${today}${n.status === 'live' && !n.path ? ' (replay stand-in)' : ''}` };
  }
  if (n.samples?.length) return { value: baseName(n.samples[0]), from: 'saved response, docs/research/samples' };
  return null;
}

export default function CockpitGlassArch() {
  const { data, loadState, error } = useMissionData();
  const member = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);

  const [sel, setSel] = useState<Selection>(null);
  const [stage, setStage] = useState<Stage>('runtime');
  const [chain, setChain] = useState<ChainFilter>('all');
  const [playing, setPlaying] = useState(true);
  const [day, setDay] = useState<{ index: number; date: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busInfo, setBusInfo] = useState<{ count: number; last: string }>({ count: 0, last: '' });
  const [layout, setLayout] = useState<Layout | null>(null);
  const [stormEvt, setStormEvt] = useState<FlareEvent | null>(null);
  const playingRef = useRef(true);

  const stageRef = useRef<HTMLDivElement>(null);
  const packetLayer = useRef<SVGGElement>(null);
  const pulse = useRef<SVGRectElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const countsRef = useRef<Record<string, number>>({});
  const dirty = useRef(false);
  const replay = useRef<Replay | null>(null);
  const bus = useMemo(() => createBus<CoreEvents>(), []);
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const ready = !!data && !!member && !!environment;
  const hasLayout = layout !== null;

  // Measure the schematic and lay it out.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      // Below the minimum width the schematic keeps its size and the stage pans sideways.
      const next = computeLayout(Math.max(el.clientWidth, MIN_W), el.clientHeight);
      layoutRef.current = next;
      setLayout(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // A panned stage opens with the bus rail in view.
  useEffect(() => {
    const el = stageRef.current;
    const l = layoutRef.current;
    if (el && l && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, l.railX - el.clientWidth * 0.6);
  }, [hasLayout]);

  // Deep link: ?metric=hr&crew=c2 or ?node=core_scoring (the body panel's Source action lands here).
  useEffect(() => {
    if (!data) return;
    const q = new URLSearchParams(window.location.search);
    const crewId = q.get('crew');
    if (crewId && data.crew.crew.some((c) => c.id === crewId)) setCrew(crewId);
    const metric = q.get('metric');
    const node = q.get('node');
    if (metric && metric in data.crew.metrics) setSel({ type: 'metric', id: metric });
    else if (node && NODE[node]) setSel({ type: 'node', id: node });
  }, [data, setCrew]);

  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(window.location.search);
    q.delete('metric');
    q.delete('node');
    if (sel) q.set(sel.type, sel.id);
    if (member) q.set('crew', member.id);
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  }, [sel, member, ready]);

  // Replay engine.
  useEffect(() => {
    if (!data || !environment || !packetLayer.current) return;
    const q = new URLSearchParams(window.location.search);
    const lead = data.crew.crew[0];
    const todayIdx = lead ? Math.max(0, dayIndex(lead, data.crew.mission.today)) : 0;
    const loopFrom = Math.max(0, todayIdx - (LOOP_DAYS - 1));
    // Open one day before the first flag in the window, so colour arrives within seconds.
    const ctx = contextFor(data.crew, environment);
    let firstFlag = todayIdx;
    for (let i = loopFrom; i <= todayIdx; i++) {
      if (data.crew.crew.some((c) => regionStatus(scoreDay(c, data.crew.metrics, i, ctx), data.crew.metrics).overall !== 'green')) {
        firstFlag = i;
        break;
      }
    }
    const startDay = q.has('day') ? Number(q.get('day')) : firstFlag;
    countsRef.current = {};
    bus.clear();
    const engine = createReplay({
      layer: packetLayer.current,
      getLayout: () => layoutRef.current,
      data,
      environment,
      bus,
      startDay,
      loopFrom,
      reduced,
      onStorm: setStormEvt,
      onDay: (index, date) => setDay({ index, date }),
      onArrive: (node, weight) => {
        countsRef.current[node] = (countsRef.current[node] ?? 0) + weight;
        dirty.current = true;
        if (node === BUS_ID && !reduced && pulse.current && pulse.current.getAnimations().length === 0) {
          const h = layoutRef.current ? layoutRef.current.pitch * 11 : 800;
          pulse.current.animate(
            [
              { transform: 'translateY(0px)', opacity: 0 },
              { opacity: 0.55, offset: 0.2 },
              { transform: `translateY(${h}px)`, opacity: 0 },
            ],
            { duration: 1100, easing: 'linear' },
          );
        }
      },
      onReset: () => {
        countsRef.current = {};
        dirty.current = true;
      },
    });
    replay.current = engine;
    engine.setPlaying(playingRef.current);
    const flush = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setCounts({ ...countsRef.current });
      const snap = bus.getSnapshot();
      const lastRec = snap[snap.length - 1];
      setBusInfo({ count: bus.count(), last: lastRec ? `${String(lastRec.type)} ${describe(lastRec)}` : '' });
    }, 250);
    return () => {
      window.clearInterval(flush);
      engine.destroy();
      replay.current = null;
    };
  }, [data, environment, bus, reduced, hasLayout]);

  // Build mode has nothing to play: the replay holds while it is shown.
  useEffect(() => {
    playingRef.current = playing && stage === 'runtime';
    replay.current?.setPlaying(playingRef.current);
  }, [playing, stage]);

  const focus: Focus | null = useMemo(() => {
    if (!sel) return null;
    return sel.type === 'node' ? focusOfNode(sel.id) : focusOfMetric(sel.id);
  }, [sel]);

  const select = useCallback((next: Selection) => {
    setSel((cur) => (cur && next && cur.type === next.type && cur.id === next.id ? null : next));
  }, []);

  if (loadState === 'error') return <p className="cga-error">{error}</p>;
  if (!data || !member || !environment) return <div className="cga-root" />;

  const crewData = data.crew;
  const today = crewData.mission.today;
  // One clock: the rail, the panel and the header all read the replay day.
  const date = day && dayIndex(member, day.date) >= 0 ? day.date : today;
  const { scores, status: regions } = statusOn(member, crewData, date, environment);
  const totalDays = member.series.length;
  const stormOn = chain === 'storm' && stage === 'runtime';
  const stormClock = stormEvt ? stormEvt.peak_time.slice(0, 16).replace('T', ' ') : null;

  const tracedMetric = sel?.type === 'metric' ? (sel.id as MetricKey) : null;
  const tracedScore = tracedMetric ? scores.find((s) => s.metric === tracedMetric) : undefined;
  const tracedRegion: Region | null = tracedMetric ? crewData.metrics[tracedMetric].body_region : null;
  const tracedStatus: Status = tracedScore?.status ?? 'green';

  const inChain = (id: string): boolean => chain === 'all' || CHAINS[chain].has(id);
  const nodeClass = (n: LNode): string => {
    const c = [`cga-n-${n.status}`];
    if (focus) c.push(!focus.nodes.has(n.id) ? 'is-dim' : !focus.mainNodes || focus.mainNodes.has(n.id) ? 'is-lit' : 'is-near');
    else if (!inChain(n.id) || (stage === 'build' && !isBuildNode(n))) c.push('is-dim');
    else if (stage === 'build') c.push('is-on');
    if (sel?.type === 'node' && sel.id === n.id) c.push('is-selected');
    return c.join(' ');
  };
  const delayOf = (hop: number | undefined): string => (hop === undefined || reduced ? '0ms' : `${hop * 40}ms`);
  const slotDelay = (id: string): string => (reduced || stage !== 'build' ? '0ms' : `${SLOT_INDEX[slotOf(NODE[id])] * 90}ms`);

  const selectedNode = sel?.type === 'node' ? NODE[sel.id] : null;
  const selectedBox = selectedNode && layout ? layout.boxes[selectedNode.id] : null;
  const statusCount = (s: LStatus): number => NODES.filter((n) => n.status === s).length;
  const gate = layout?.boxes[GATE_ID];
  const bodyHref = tracedMetric ? `${import.meta.env.BASE_URL}concepts/${BODY_CONCEPT}?crew=${member.id}&metric=${tracedMetric}` : '';

  const tagline = (
    <>
      {POSITIONING[0]}
      <sup>{POSITIONING[1]}</sup>
      {POSITIONING[2]}
    </>
  );

  return (
    <div className="cga-root" data-stage={stage} data-chain={chain} data-focus={focus ? 'on' : undefined}>
      <header className="cga-top">
        <div className="cga-brand">
          <span className="cga-mark">
            e<sup>x</sup>
          </span>
          <span className="cga-title">Systems</span>
        </div>
        <dl className="cga-facts">
          <div>
            <dt>Mission</dt>
            <dd>{crewData.mission.name}</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{crewData.environments[environment].label}</dd>
          </div>
          {stormOn ? (
            <div>
              <dt>Storm clock</dt>
              <dd>
                {stormClock ?? 'n/a'}
                <span className="cga-unit"> test window</span>
              </dd>
            </div>
          ) : (
            <div>
              <dt>Mission day</dt>
              <dd>
                {dayIndex(member, date) + 1}
                <span className="cga-unit"> / {totalDays} </span>
                {date}
              </dd>
            </div>
          )}
        </dl>
        <p className="cga-tagline">{tagline}</p>
        <div className="cga-busfact">
          <span className="cga-label">Bus events</span>
          <span className="cga-busnum">{fmt(busInfo.count)}</span>
          <span className="cga-buslast">{busInfo.last}</span>
        </div>
      </header>

      <main className="cga-main">
        <div className="cga-stage" ref={stageRef}>
          {layout && (
            <div className="cga-canvas" style={{ width: layout.W, height: layout.H }}>
              <svg className="cga-svg" width={layout.W} height={layout.H} aria-hidden="true">
                <defs>
                  <marker id="cga-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M1 1 L7 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.2" />
                  </marker>
                  <linearGradient id="cga-pulse" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2BDBE3" stopOpacity="0" />
                    <stop offset="0.7" stopColor="#F8FCFD" stopOpacity="1" />
                    <stop offset="1" stopColor="#2BDBE3" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Column rules */}
                {layout.headers.map((h) => (
                  <line key={h.index} className="cga-rule" x1={h.x} x2={h.x + h.w} y1={HEADER_H - 4} y2={HEADER_H - 4} />
                ))}

                {/* Edges: at rest only the replay trunks read; everything else waits for a lit path */}
                <g>
                  {EDGES.map((e) => {
                    const k = edgeKey(e);
                    const cls = [`cga-e cga-e-${e.status}`];
                    const build = isBuildEdge(e);
                    let tier: string;
                    if (focus) tier = !focus.edges.has(k) ? 'is-dim' : !focus.mainEdges || focus.mainEdges.has(k) ? 'is-lit' : 'is-near';
                    else if (stage === 'build') tier = build ? 'is-on' : 'is-dim';
                    else if (!inChain(e.from) || !inChain(e.to)) tier = 'is-dim';
                    else if (REPLAY_EDGES.has(k)) tier = 'is-trunk';
                    else if (chain !== 'all' || (build && !e.relation && e.status !== 'planned')) tier = 'is-soft';
                    else tier = 'is-faint';
                    cls.push(tier);
                    return (
                      <path
                        key={k}
                        className={cls.join(' ')}
                        d={layout.d[k]}
                        markerEnd={e.to === BUS_ID || e.to === GATE_ID || tier === 'is-faint' || tier === 'is-dim' ? undefined : 'url(#cga-arrow)'}
                        style={{ transitionDelay: focus ? delayOf(focus.edges.get(k)) : slotDelay(e.from) }}
                      />
                    );
                  })}
                </g>

                {/* Bus rail: the spine every runtime edge meets. Observation is a segment of it. */}
                <g className={`cga-rail ${focus && !focus.nodes.has(BUS_ID) ? 'is-dim' : ''} ${!focus && stage === 'build' ? 'is-dim' : ''}`}>
                  <line className="cga-rail-glow" x1={layout.railX} x2={layout.railX} y1={layout.rowsTop} y2={layout.rowsTop + layout.pitch * 11} />
                  <line className="cga-rail-line" x1={layout.railX} x2={layout.railX} y1={layout.rowsTop} y2={layout.rowsTop + layout.pitch * 11} />
                  {Array.from({ length: 12 }, (_, r) => (
                    <line key={r} className="cga-rail-tick" x1={layout.railX - 5} x2={layout.railX + 5} y1={layout.rowsTop + r * layout.pitch} y2={layout.rowsTop + r * layout.pitch} />
                  ))}
                  {gate && (
                    <>
                      <rect className="cga-rail-seg" x={gate.x} y={gate.y} width={gate.w} height={gate.h} />
                      <line className="cga-rail-cap" x1={gate.x - 5} x2={gate.x + gate.w + 5} y1={gate.y} y2={gate.y} />
                      <line className="cga-rail-cap" x1={gate.x - 5} x2={gate.x + gate.w + 5} y1={gate.y + gate.h} y2={gate.y + gate.h} />
                    </>
                  )}
                  <rect ref={pulse} className="cga-rail-pulse" x={layout.railX - 2} y={layout.rowsTop - 140} width={4} height={140} fill="url(#cga-pulse)" opacity={0} />
                </g>
              </svg>

              <svg className="cga-svg cga-svg-packets" width={layout.W} height={layout.H} aria-hidden="true">
                <g ref={packetLayer} />
              </svg>

              <svg className="cga-svg" width={layout.W} height={layout.H} aria-hidden="true">
                {/* Node outlines: line style repeats the status glyph */}
                {NODES.filter((n) => n.id !== BUS_ID && n.id !== GATE_ID).map((n) => {
                  const b = layout.boxes[n.id];
                  return (
                    <rect
                      key={n.id}
                      className={`cga-box ${nodeClass(n)}`}
                      x={b.x + 0.5}
                      y={b.y + 0.5}
                      width={b.w - 1}
                      height={b.h - 1}
                      rx={2}
                      style={{ transitionDelay: focus ? delayOf(focus.nodes.get(n.id)) : slotDelay(n.id) }}
                    />
                  );
                })}
              </svg>

              {layout.headers.map((h) => (
                <div key={h.index} className="cga-colhead" style={{ left: h.x, width: h.w }}>
                  <span className="cga-colname">
                    <span className="cga-colidx">{h.index}</span> {h.title}
                  </span>
                  <span className="cga-colowner">{h.owners}</span>
                </div>
              ))}

              {NODES.map((n) => {
                const b = layout.boxes[n.id];
                const count = counts[n.id] ?? 0;
                const style = { transitionDelay: focus ? delayOf(focus.nodes.get(n.id)) : slotDelay(n.id) };
                if (n.id === BUS_ID) {
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`cga-hit cga-hit-rail ${nodeClass(n)}`}
                      style={{ left: b.x - 36, top: b.y, width: 72, height: b.h }}
                      onClick={() => select({ type: 'node', id: n.id })}
                      aria-label={`${n.label}, ${STATUS_LABEL[n.status]}`}
                    />
                  );
                }
                if (n.id === GATE_ID) {
                  // The label sits on the row boundary under the first adapter line, clear of the edges.
                  const mid = b.y + 6 + NODE_H / 2 + layout.pitch / 2;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`cga-hit cga-gate ${nodeClass(n)}`}
                      style={{ left: layout.railX - 112, top: mid - 36, width: 104, height: 72, ...style }}
                      onClick={() => select({ type: 'node', id: n.id })}
                      aria-label={`${n.label}, ${STATUS_LABEL[n.status]}`}
                    >
                      <span className="cga-gate-label">{n.label}</span>
                      <span className="cga-count">{count ? fmt(count) : ''}</span>
                    </button>
                  );
                }
                const hitH = Math.min(layout.pitch - 2, 76);
                const showBody = n.id === 'core_scoring' && tracedRegion !== null;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`cga-hit cga-node ${nodeClass(n)}`}
                    style={{ left: b.x, top: b.cy - hitH / 2, width: b.w, height: hitH, ...style }}
                    onClick={() => select({ type: 'node', id: n.id })}
                    aria-label={`${n.label}, ${STATUS_LABEL[n.status]}${count ? `, ${count} events` : ''}`}
                  >
                    <span className="cga-node-in" style={{ height: NODE_H }}>
                      <StatusGlyph status={n.status} />
                      <span className="cga-node-label">{breakable(n.label)}</span>
                      {showBody && tracedRegion && (
                        <BodyFigure className="cga-body-mini" height={NODE_H - 8} only={tracedRegion} status={{ ...regions, [tracedRegion]: tracedStatus }} />
                      )}
                    </span>
                    {count > 0 && <span className="cga-count cga-node-count">{fmt(count)}</span>}
                  </button>
                );
              })}

              {/* Focus brackets travel from the previous node and snap onto the new one */}
              <div
                className={`cga-brackets ${selectedBox ? 'is-on' : ''}`}
                style={
                  selectedBox
                    ? {
                        transform: `translate(${(selectedBox.w < 28 ? selectedBox.cx - 14 : selectedBox.x) - 7}px, ${selectedBox.y - 7}px)`,
                        width: Math.max(28, selectedBox.w) + 14,
                        height: selectedBox.h + 14,
                      }
                    : undefined
                }
              >
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
        </div>

        <aside className="cga-side">
          <div className="cga-side-base">
            <div className="cga-crew">
              {crewData.crew.map((c) => {
                const st = statusOn(c, crewData, date, environment).status.overall;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`cga-crewbtn ${c.id === member.id ? 'is-on' : ''}`}
                    onClick={() => setCrew(c.id)}
                    aria-label={`${c.name}, ${STATUS_WORD[st]}`}
                    aria-pressed={c.id === member.id}
                  >
                    <span>{initials(c.name)}</span>
                    <Shape status={st} size={12} />
                  </button>
                );
              })}
              <div className="cga-crewname">
                <span>{plainName(member.name)}</span>
                <span className="cga-label">{member.role}</span>
              </div>
            </div>

            <div className="cga-where">
              <BodyFigure status={regions} height={156} />
              <ul className="cga-regions">
                {REGIONS.map((r) => {
                  const hit = scores.filter((s) => s.status !== 'green' && crewData.metrics[s.metric].body_region === r);
                  return (
                    <li key={r} className={regions[r] !== 'green' ? 'is-flagged' : ''}>
                      <Shape status={regions[r]} size={10} />
                      <span>{REGION_WORD[r]}</span>
                      <span className="cga-region-why">{hit.map((s) => shortLabel(s.metric, crewData.metrics[s.metric].label)).join(', ')}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="cga-label cga-listhead">
              <span>Trace a metric</span>
              <span>{date}</span>
            </p>
            <ul className="cga-metrics">
              {scores.map((s) => (
                <li key={s.metric}>
                  <button
                    type="button"
                    className={`cga-metric ${tracedMetric === s.metric ? 'is-on' : ''}`}
                    onClick={() => select({ type: 'metric', id: s.metric })}
                    aria-label={`${crewData.metrics[s.metric].label}, ${s.value} ${crewData.metrics[s.metric].unit}, ${STATUS_WORD[s.status]}`}
                  >
                    <Shape status={s.status} />
                    <span className="cga-metric-name">{shortLabel(s.metric, crewData.metrics[s.metric].label)}</span>
                    <span className="cga-metric-val">{s.value}</span>
                    <span className="cga-metric-unit">{crewData.metrics[s.metric].unit}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className={`cga-panel ${sel ? 'is-open' : ''}`} aria-hidden={!sel}>
            {selectedNode && (
              <NodePanel node={selectedNode} data={data} member={member} scores={scores} date={date} busCount={busInfo.count} count={counts[selectedNode.id] ?? 0} onJump={(id) => setSel({ type: 'node', id })} />
            )}
            {tracedMetric && focus && (
              <MetricPanel metric={tracedMetric} data={data} member={member} environment={environment} date={date} score={tracedScore} focus={focus} />
            )}
            <div className="cga-panel-foot">
              <button type="button" className="cga-secondary" onClick={() => setSel(null)} tabIndex={sel ? 0 : -1}>
                {tracedMetric ? 'Clear' : 'Close'}
              </button>
              {tracedMetric && (
                <a className="cga-primary" href={bodyHref} tabIndex={sel ? 0 : -1}>
                  <BodyFigure className="cga-body-mini" height={44} only={tracedRegion ?? undefined} status={{ ...regions, ...(tracedRegion ? { [tracedRegion]: tracedStatus } : {}) }} />
                  <span>Open on body</span>
                </a>
              )}
            </div>
          </div>
        </aside>
      </main>

      <div className="cga-bar">
        <ul className="cga-legend" aria-label="Status marks">
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <StatusGlyph status={s} size={12} />
              <span>{STATUS_LABEL[s]}</span>
              <span className="cga-legend-n">{statusCount(s)}</span>
            </li>
          ))}
          <li>
            <span className="cga-count">n</span>
            <span>Events this replay</span>
          </li>
        </ul>

        <div className="cga-toggles">
          <div className="cga-seg" role="group" aria-label="Stage">
            {(['build', 'runtime'] as Stage[]).map((v) => (
              <button key={v} type="button" className={stage === v ? 'is-on' : ''} aria-pressed={stage === v} onClick={() => setStage(v)}>
                {v === 'build' ? 'Build' : 'Runtime'}
              </button>
            ))}
          </div>
          <div className="cga-seg" role="group" aria-label="Chain">
            {(['all', 'crew', 'storm'] as ChainFilter[]).map((v) => (
              <button key={v} type="button" className={chain === v ? 'is-on' : ''} aria-pressed={chain === v} onClick={() => setChain(v)}>
                {v === 'all' ? 'All' : v === 'crew' ? 'Crew' : 'Storm'}
              </button>
            ))}
          </div>
        </div>

        <div className="cga-replay">
          <div className="cga-replay-read">
            <span className="cga-label">{stage === 'build' ? 'Built' : stormOn ? 'Storm clock' : playing ? 'Replaying' : 'Paused'}</span>
            <span className="cga-replay-val">
              {stage === 'build' ? crewData.meta.generated_at.slice(0, 16).replace('T', ' ') : stormOn ? stormClock ?? 'n/a' : date}
            </span>
          </div>
          {stage === 'runtime' && (
            <button type="button" className="cga-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause replay' : 'Play replay'}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                {playing ? <path d="M6 4v12 M14 4v12" /> : <path d="M6 4l10 6-10 6z" />}
              </svg>
            </button>
          )}
        </div>
      </div>

      <footer className="cga-foot">
        <p className="cga-foot-tagline">{tagline}</p>
        <p>
          {[...DISCLAIMERS, `Space weather data: ${data.storm.meta.data_credit}`, `Model: ${data.storm.meta.model}`].join('  ·  ')}
        </p>
        <p>{ANATOMY_CREDIT}</p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cga-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function NodePanel({
  node, data, member, scores, date, busCount, count, onJump,
}: {
  node: LNode;
  data: MissionData;
  member: CrewMember;
  scores: MetricScore[];
  date: string;
  busCount: number;
  count: number;
  onJump: (id: string) => void;
}) {
  const sample = sampleFor(node, data, member, scores, busCount, date);
  const chainUp = breadcrumb(node.id);
  const file = node.path ?? node.impl ?? node.samples?.[0];
  const link = node.url && !node.url.includes('{') ? node.url : null;
  const ins = incoming(node.id).length;
  const outs = outgoing(node.id).length;
  // Only nodes the replay passes through have an events count worth leading with.
  const emits = count > 0 || REPLAY_NODES.has(node.id);
  return (
    <div className="cga-panel-body" key={node.id}>
      <p className="cga-label cga-panel-kicker">
        <span>{node.id}</span>
        <span>{LINEAGE.meta.layers[String(node.layer)]}</span>
      </p>
      <h2 className="cga-panel-title">{node.label}</h2>
      <p className="cga-statusline">
        <StatusGlyph status={node.status} size={12} />
        <span>{STATUS_LABEL[node.status]}</span>
        <span className="cga-dim cga-cap">{node.owner}</span>
      </p>

      {emits ? (
        <div className="cga-hero">
          <span className="cga-hero-num">{fmt(count)}</span>
          <span className="cga-hero-unit">events this replay</span>
        </div>
      ) : (
        <div className="cga-hero cga-hero-quiet">
          <span className="cga-hero-text">{sample ? sample.value : STATUS_LABEL[node.status]}</span>
          <span className="cga-hero-unit">{sample ? sample.from : 'No events in this replay'}</span>
        </div>
      )}

      <p className="cga-source">{node.source}</p>

      <dl className="cga-rows">
        <Row label="Carries">
          <span className="cga-fields">{node.fields.join('  ')}</span>
        </Row>
        <Row label="From">
          <span className="cga-crumbs">
            {chainUp.map((n, i) => (
              <span key={n.id} className="cga-crumb">
                {n.id === node.id ? (
                  <span className="cga-crumb-here">{n.label}</span>
                ) : (
                  <button type="button" onClick={() => onJump(n.id)}>
                    {n.label}
                  </button>
                )}
                {i < chainUp.length - 1 && <span className="cga-crumb-sep">/</span>}
              </span>
            ))}
          </span>
        </Row>
        <Row label="Links">
          {ins} in · {outs} out
        </Row>
        {node.cadence && <Row label="Cadence">{node.cadence}</Row>}
        {node.license && <Row label="Licence">{node.license}</Row>}
        {sample && emits && (
          <Row label="Sample">
            <span className="cga-sample">{sample.value}</span>
            <span className="cga-dim cga-block">{sample.from}</span>
          </Row>
        )}
        {file && (
          <Row label="File">
            <span className="cga-mono">{baseName(file)}</span>
          </Row>
        )}
        <Row label="Ref">
          <span className="cga-mono">{node.ref[0]}</span>
        </Row>
        {link && (
          <Row label="Source">
            <a href={link} target="_blank" rel="noreferrer">
              {new URL(link).hostname}
            </a>
          </Row>
        )}
      </dl>
    </div>
  );
}

const trim = (n: number): string => String(Number(n.toFixed(2)));

function MetricPanel({
  metric, data, member, environment, date, score, focus,
}: {
  metric: MetricKey;
  data: MissionData;
  member: CrewMember;
  environment: EnvironmentId;
  date: string;
  score: MetricScore | undefined;
  focus: Focus;
}) {
  const m = data.crew.metrics[metric];
  const baseline = member.baseline[metric];
  const status: Status = score?.status ?? 'green';
  const loinc = NODE[GATE_ID]?.loinc?.[metric];
  const ctx = contextFor(data.crew, environment);

  // Days running: consecutive days up to the replay day on which core scoring flags this metric.
  let running = 0;
  for (let i = dayIndex(member, date); i >= 0; i--) {
    const s = scoreMetric(metric, m, baseline, member.series, i, ctx);
    if (!s || s.status === 'green') break;
    running += 1;
  }

  // Path steps grouped by printed column, with the body region between Core and Surfaces.
  const steps = COLUMNS.map((c) => ({
    title: c.title,
    labels: NODES.filter((n) => focus.nodes.has(n.id) && c.slots.includes(slotOf(n))).map((n) => n.label),
  })).filter((s) => s.labels.length);
  const coreAt = steps.findIndex((s) => s.title === 'Core');
  steps.splice(coreAt + 1, 0, { title: 'Body', labels: [REGION_WORD[m.body_region]] });

  // Baseline strip: band = mean +/- AMBER_Z sd on a scale of +/- (RED_Z + 1) sd.
  const span = RED_Z + 1;
  const z = score?.z ?? null;
  const markerPct = z === null ? null : Math.min(100, Math.max(0, ((z + span) / (2 * span)) * 100));
  const bandLeft = ((span - AMBER_Z) / (2 * span)) * 100;

  // Metrics without a personal baseline sit on an absolute band (contract rule, core/scoring.ts).
  let abs: { max: number; watch: number; left: string; right: string } | null = null;
  if (!baseline && score) {
    if (metric === 'dose_mSv_cum') {
      const max = ctx.careerLimit_mSv;
      abs = { max, watch: DOSE_CUM_AMBER_FRACTION * max, left: `Career limit ${trim(max)} ${m.unit}`, right: `${trim((score.value / max) * 100)} %` };
    } else if (metric === 'dose_mSv_day') {
      const watch = DOSE_DAY_AMBER_FACTOR * ctx.envDosePerDay;
      abs = { max: m.absolute_red.max, watch, left: `Watch above ${trim(watch)}`, right: `Act above ${trim(m.absolute_red.max)}` };
    } else if (metric === 'bone_loss_pct') {
      abs = { max: m.absolute_red.max, watch: BONE_LOSS_AMBER_PCT, left: `Watch above ${trim(BONE_LOSS_AMBER_PCT)}`, right: `Act above ${trim(m.absolute_red.max)}` };
    }
  }
  const pct = (v: number, max: number): number => Math.min(100, Math.max(0, (v / max) * 100));

  return (
    <div className="cga-panel-body" key={metric}>
      <p className="cga-label cga-panel-kicker">
        <span>{loinc ? `${metric} · LOINC ${loinc}` : metric}</span>
        <span>{plainName(member.name)}</span>
      </p>
      <h2 className="cga-panel-title">{m.label}</h2>
      <p className={`cga-statusline cga-st-${status}`}>
        <Shape status={status} size={14} />
        <span>{STATUS_WORD[status]}</span>
        {running > 0 && <span className="cga-dim">{running} d running</span>}
      </p>

      <div className="cga-reading">
        <div className="cga-reading-main">
          <div className="cga-hero">
            <span className="cga-hero-num">{score ? score.value : 'n/a'}</span>
            <span className="cga-hero-unit">{m.unit}</span>
          </div>

          {baseline && markerPct !== null && (
            <div className="cga-band" aria-label="Personal baseline band">
              <div className="cga-band-track">
                <div className="cga-band-fill" style={{ left: `${bandLeft}%`, right: `${bandLeft}%` }} />
                <div className={`cga-band-mark cga-st-${status}`} style={{ left: `${markerPct}%` }} />
              </div>
              <p className="cga-band-read">
                <span>Baseline {baseline.mean} ± {baseline.sd}</span>
                <span>z {(z as number).toFixed(2)}</span>
              </p>
            </div>
          )}
          {abs && score && (
            <div className="cga-band" aria-label="Absolute band">
              <div className="cga-band-track">
                <div className="cga-band-fill" style={{ left: 0, right: `${100 - pct(abs.watch, abs.max)}%` }} />
                <div className={`cga-band-mark cga-st-${status}`} style={{ left: `${pct(score.value, abs.max)}%` }} />
              </div>
              <p className="cga-band-read">
                <span>{abs.left}</span>
                <span>{abs.right}</span>
              </p>
            </div>
          )}
        </div>
        <div className={`cga-reading-where cga-st-${status}`}>
          <BodyFigure only={m.body_region} status={{ brain: status, heart: status, blood: status, bones: status, whole_body: status }} height={150} />
          <span>{REGION_WORD[m.body_region]}</span>
        </div>
      </div>

      <ol className="cga-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.title === 'Body' ? `cga-step-body cga-st-${status}` : ''}>
            <span className="cga-step-idx">{String(i + 1).padStart(2, '0')}</span>
            <span className="cga-step-col">{s.title}</span>
            <span className="cga-step-nodes">{s.labels.join(' · ')}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
