// e^x Crew Station, concept "Cockpit Glass", body surface.
// A flight instrument, not a dashboard: the astronaut's own body inside one
// instrument ring, issues parked on the ring at the height of the organ.
// Deep link: /concepts/cockpit-glass-body?crew=c2&region=brain&metric=sleep_h
import { Link } from 'react-router-dom';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { ANATOMY_CREDIT, DISCLAIMERS } from '../../components/Footer';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import { REGIONS, type CrewData, type CrewMember, type MetricKey, type Region, type Status } from '../../data/types';
import type { ConceptMeta } from '../../registry';
import { FOV, GlassBody, HOME_DIST, HOME_TARGET, homeCamera, type BodyColors, type FrameData } from './GlassBody';
import { ARCH_ID, Detail, Overview } from './Panel';
import { Icon, Shape, useReducedMotion, useSize } from './bits';
import {
  REGION_WORD,
  STATUS_WORD,
  bodyMap,
  buildCrewView,
  fmt,
  focusBox,
  initials,
  nodeStatuses,
  shortLabel,
  type CrewView,
  type MetricView,
  type Vec3,
} from './model';
import './cockpit.css';

export const meta: ConceptMeta = {
  title: 'Glass Body',
  direction: 'Cockpit Glass',
  surface: 'body',
};

// Mirrors the tokens in cockpit.css for the 3D materials.
const COLORS: BodyColors = {
  neutral: '#505EAC',
  skin: '#BDEFF4',
  ghost: '#8C9AE0',
  focus: '#F8FCFD',
  status: { green: '#3DDC97', amber: '#F5B83D', red: '#FF4D4F' },
};

const VIEWS = ['Front', 'Left', 'Back', 'Right'];
const BODY_H = bodyMap.model.height_m;
const READOUT_GAP = 88;
/** Width kept free for a parked readout: flagged ones carry a value line. */
const READOUT_W = { lit: 208, quiet: 132 };
const STAGE_PAD = 16;
/** Space between the focus box and its brackets, and between the brackets and the docked readout. */
const BRACKET_PAD = 14;
const DOCK_GAP = 44;

/* ------------------------------------------------------------------ stage */

interface Parked {
  region: Region;
  side: -1 | 1;
  y: number;
  /** Inner edge of the readout: on the ring when there is room, pulled inside it when the stage is narrow. */
  x: number;
}

function Stage(props: {
  view: CrewView;
  region: Region | null;
  metric: MetricKey | null;
  metricStatus: Status | null;
  reduced: boolean;
  onRegion: (r: Region | null) => void;
}) {
  const { view, region, metric, metricStatus, reduced, onRegion } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(wrap);
  const [yawStep, setYawStep] = useState(0);
  const drag = useRef(0);
  const press = useRef<{ x: number; base: number; moved: boolean } | null>(null);

  // A new selection turns the body to the side body-map suggests for that metric.
  useEffect(() => {
    if (!metric) return;
    const want = Math.round(bodyMap.metrics[metric].view_deg / 90);
    setYawStep((s) => s + ((((want - s) % 4) + 6) % 4) - 2);
  }, [metric]);

  const anchors = useMemo<Vec3[]>(
    () => REGIONS.map((r) => bodyMap.metrics[r === region && metric ? metric : view.regions[r].lead].anchor),
    [view, region, metric],
  );
  const focus = useMemo(() => (metric ? focusBox(metric) : null), [metric]);
  const nodeStatus = useMemo(() => nodeStatuses(view), [view]);

  // Ring, ticks and parked readouts are laid out once per size from the home camera.
  const layout = useMemo(() => {
    if (!w || !h) return null;
    const cam = homeCamera(w / h);
    const v = new THREE.Vector3();
    const py = (y: number) => (-v.set(0, y, 0).project(cam).y * 0.5 + 0.5) * h;
    const cx = w / 2;
    const cy = py(BODY_H / 2);
    const R = (cy - py(BODY_H)) * 1.14;
    const ringX = (y: number, side: number) => cx + side * Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy)));
    const parked: Parked[] = REGIONS.map((r) => {
      const m = bodyMap.metrics[view.regions[r].lead];
      return { region: r, side: m.label_side === 'screen_left' ? -1 : 1, y: py(m.anchor[1]), x: 0 };
    });
    for (const side of [-1, 1]) {
      const col = parked.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
      col.forEach((p, i) => {
        const min = i ? col[i - 1].y + READOUT_GAP : cy - R * 0.9;
        p.y = Math.min(Math.max(p.y, min), cy + R * 0.9);
      });
    }
    parked.forEach((p) => {
      const room = READOUT_W[view.regions[p.region].status === 'green' ? 'quiet' : 'lit'] + STAGE_PAD;
      const onRing = ringX(p.y, p.side) + p.side * 12;
      p.x = p.side > 0 ? Math.min(onRing, w - room) : Math.max(onRing, room);
    });
    const ticks: { y: number; x0: number; x1: number; major: boolean }[] = [];
    for (let i = 0; i <= Math.floor(BODY_H * 10); i++) {
      const y = py(i / 10);
      const major = i % 5 === 0;
      for (const side of [-1, 1]) {
        const x = ringX(y, side);
        ticks.push({ y, x0: x - side * (major ? 14 : 6), x1: x, major });
      }
    }
    return { cx, cy, R, parked, ticks };
  }, [w, h, view]);

  /* per-frame overlay writes, through refs only */
  const frame = useRef<FrameData>({ anchors: new Float32Array(REGIONS.length * 2), rect: new Float32Array(4) });
  const lines = useRef<(SVGPolylineElement | null)[]>([]);
  const dots = useRef<(SVGGElement | null)[]>([]);
  const bracket = useRef<SVGPathElement>(null);
  const rect = useRef<Float32Array | null>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);
  const live = useRef({ layout, region, w, h, view });
  live.current = { layout, region, w, h, view };

  const onFrame = useCallback((dt: number) => {
    const { layout: L, region: sel, w: W, h: Hh, view: V } = live.current;
    if (!L) return;
    const a = frame.current.anchors;
    const path = bracket.current;
    // Brackets travel to the new region instead of jumping.
    let r: Float32Array | null = null;
    if (path && sel) {
      const target = frame.current.rect;
      if (!rect.current) rect.current = Float32Array.from(target);
      r = rect.current;
      for (let k = 0; k < 4; k++) r[k] = THREE.MathUtils.damp(r[k], target[k], 16, dt);
    } else rect.current = null;
    L.parked.forEach((p) => {
      const i = REGIONS.indexOf(p.region);
      // The open region's leader ends on the framed anatomy, not on the resting anchor.
      const onSel = r && p.region === sel;
      const tag = tags.current[i];
      if (onSel && r) {
        // The open readout leaves the ring and docks beside the brackets, at their height:
        // the leader is one short level stroke instead of a diagonal across the anatomy.
        const room = READOUT_W[V.regions[p.region].status === 'green' ? 'quiet' : 'lit'] + STAGE_PAD;
        const edge = p.side > 0 ? r[2] + BRACKET_PAD : r[0] - BRACKET_PAD;
        const want = edge + p.side * DOCK_GAP;
        const x = p.side > 0 ? Math.min(want, W - room) : Math.max(want, room);
        const y = Math.min(Math.max((r[1] + r[3]) / 2, 56), Hh - 56);
        tag?.style.setProperty('--cg-dx', `${(x - p.x).toFixed(1)}px`);
        tag?.style.setProperty('--cg-dy', `${(y - p.y).toFixed(1)}px`);
        const x0 = x - p.side * 4;
        lines.current[i]?.setAttribute('points', `${x0.toFixed(1)},${y.toFixed(1)} ${edge.toFixed(1)},${y.toFixed(1)}`);
        dots.current[i]?.setAttribute('transform', `translate(${((r[0] + r[2]) / 2).toFixed(1)} ${((r[1] + r[3]) / 2).toFixed(1)})`);
        return;
      }
      tag?.style.removeProperty('--cg-dx');
      tag?.style.removeProperty('--cg-dy');
      const ax = a[i * 2];
      const ay = a[i * 2 + 1];
      const x0 = p.x - p.side * 4;
      lines.current[i]?.setAttribute('points', `${x0.toFixed(1)},${p.y.toFixed(1)} ${(x0 - p.side * 26).toFixed(1)},${p.y.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`);
      dots.current[i]?.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)})`);
    });
    if (!path || !r) return;
    const pad = BRACKET_PAD;
    const [x0, y0, x1, y1] = [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad];
    const c = Math.min(22, (x1 - x0) / 3, (y1 - y0) / 3);
    path.setAttribute(
      'd',
      `M${x0} ${y0 + c}V${y0}H${x0 + c}M${x1 - c} ${y0}H${x1}V${y0 + c}M${x1} ${y1 - c}V${y1}H${x1 - c}M${x0 + c} ${y1}H${x0}V${y1 - c}`,
    );
  }, []);

  const turn = (d: number) => setYawStep((s) => s + d);
  const viewName = VIEWS[((yawStep % 4) + 4) % 4];
  const auraLevel = useMemo(() => {
    const cum = view.regions.whole_body.metrics.find((m) => m.key === 'dose_mSv_cum');
    return cum?.score ? Math.min(1, cum.score.value / cum.meta.absolute_red.max) : 0;
  }, [view]);

  return (
    <section
      className="cg-stage"
      ref={wrap}
      data-focus={!!region}
      onPointerDown={(e) => (press.current = { x: e.clientX, base: drag.current, moved: false })}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || !(e.buttons & 1)) return;
        const dx = e.clientX - p.x;
        if (Math.abs(dx) > 8) p.moved = true;
        if (p.moved) drag.current = p.base + dx;
      }}
    >
      <div className="cg-glow" style={layout ? { left: layout.cx, top: layout.cy, width: layout.R * 2.5, height: layout.R * 2.5 } : undefined} />

      <Canvas
        flat
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: FOV, near: 0.1, far: 50, position: [HOME_TARGET[0], HOME_TARGET[1], HOME_DIST] }}
        onPointerMissed={() => !press.current?.moved && onRegion(null)}
      >
        <Suspense fallback={null}>
          <GlassBody
            nodeStatus={nodeStatus}
            auraLevel={auraLevel}
            selected={region}
            focusMetric={metric}
            focusStatus={metricStatus}
            focus={focus}
            yawDeg={yawStep * 90}
            anchors={anchors}
            colors={COLORS}
            reduced={reduced}
            frame={frame}
            onFrame={onFrame}
            onSelect={onRegion}
            drag={drag}
          />
        </Suspense>
      </Canvas>

      {layout && (
        <svg className="cg-overlay" width={w} height={h} aria-hidden>
          <circle className="cg-ring" cx={layout.cx} cy={layout.cy} r={layout.R} pathLength={1} />
          <circle className="cg-ring-inner" cx={layout.cx} cy={layout.cy} r={layout.R - 22} />
          {layout.ticks.map((t, i) => (
            <line key={i} className="cg-tick" data-major={t.major} x1={t.x0} x2={t.x1} y1={t.y} y2={t.y} />
          ))}
          {layout.parked.map((p) => {
            const i = REGIONS.indexOf(p.region);
            const s = view.regions[p.region].status;
            const state = region ? (region === p.region ? 'on' : 'off') : 'idle';
            return (
              <g key={`${p.region}:${state}`} className="cg-leader" data-status={s} data-state={state}>
                <polyline ref={(el) => (lines.current[i] = el)} pathLength={1} />
                <g ref={(el) => (dots.current[i] = el)}>
                  {s === 'green' ? <circle r={3.5} /> : s === 'amber' ? <path d="M0 -7 7 6H-7Z" /> : <rect x={-5.5} y={-5.5} width={11} height={11} />}
                </g>
              </g>
            );
          })}
          <path ref={bracket} className="cg-bracket" data-on={!!region} />
        </svg>
      )}

      {layout?.parked.map((p) => {
        const rv = view.regions[p.region];
        const m = rv.metrics.find((x) => x.key === rv.lead) as MetricView;
        const lit = rv.status !== 'green';
        return (
          <button
            key={p.region}
            ref={(el) => (tags.current[REGIONS.indexOf(p.region)] = el)}
            className="cg-readout"
            data-side={p.side < 0 ? 'left' : 'right'}
            data-status={rv.status}
            data-state={region ? (region === p.region ? 'on' : 'off') : 'idle'}
            style={p.side < 0 ? { right: w - p.x, top: p.y } : { left: p.x, top: p.y }}
            onClick={() => onRegion(p.region)}
          >
            <Shape status={rv.status} size={lit ? 18 : 12} />
            <span className="cg-readout-text">
              <span className="cg-readout-word">{REGION_WORD[p.region]}</span>
              {lit && m.score && (
                <span className="cg-readout-sub">
                  {shortLabel(m.key, m.meta)} <b>{fmt(m.score.value)}</b>
                </span>
              )}
            </span>
          </button>
        );
      })}

      <div className="cg-rotate" role="group" aria-label="Turn body">
        <p className="cg-label" aria-live="polite">{viewName}</p>
        <button className="cg-square" onClick={() => turn(-1)} aria-label="Turn body left">
          <Icon name="left" />
        </button>
        <button className="cg-square" onClick={() => turn(1)} aria-label="Turn body right">
          <Icon name="right" />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ shell */

function missionDay(data: CrewData): number {
  const ms = Date.parse(`${data.mission.today}T00:00:00Z`) - Date.parse(`${data.mission.start_date}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cg-fact">
      <p className="cg-label">{label}</p>
      <p className="cg-fact-value">{children}</p>
    </div>
  );
}

export default function CockpitGlassBody() {
  const { data, loadState, error } = useMissionData();
  const crew = useSelectedCrew();
  const region = useMissionStore((s) => s.selectedRegion);
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const setRegion = useMissionStore((s) => s.setSelectedRegion);
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [source, setSource] = useState(false);
  const reduced = useReducedMotion();

  const views = useMemo(() => {
    if (!data || !environment) return null;
    return new Map<string, CrewView>(data.crew.crew.map((c) => [c.id, buildCrewView(c, data.crew, environment)]));
  }, [data, environment]);
  const view = crew && views ? (views.get(crew.id) ?? null) : null;

  // Deep link, applied once when the data is in.
  const linked = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!data || linked.current) return;
    linked.current = true;
    const q = new URLSearchParams(window.location.search);
    const c = q.get('crew');
    const r = q.get('region') as Region | null;
    const m = q.get('metric') as MetricKey | null;
    if (c && data.crew.crew.some((x) => x.id === c)) setCrew(c);
    const viaMetric = m && data.crew.metrics[m] ? data.crew.metrics[m].body_region : null;
    const target = r && REGIONS.includes(r) ? r : viaMetric;
    if (target) {
      setRegion(target);
      if (m && viaMetric === target) setMetric(m);
      setSource(q.has('source'));
    }
    setReady(true);
  }, [data, setCrew, setRegion]);

  const pickRegion = useCallback(
    (r: Region | null) => {
      setRegion(r);
      setMetric(null);
      if (!r) setSource(false);
    },
    [setRegion],
  );
  const pickCrew = (c: CrewMember) => {
    setCrew(c.id);
    setMetric(null);
  };

  const active: MetricKey | null =
    data && view && region ? (metric && data.crew.metrics[metric].body_region === region ? metric : view.regions[region].lead) : null;

  // The address follows the state, so reload, back and the map round trip land on the same view.
  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (crew) q.set('crew', crew.id);
    if (region) q.set('region', region);
    if (active) q.set('metric', active);
    if (active && source) q.set('source', '1');
    return q.toString();
  }, [crew, region, active, source]);
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${query}`);
  }, [query, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && region) pickRegion(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [region, pickRegion]);

  if (loadState === 'error') return <p className="cg-error">{error}</p>;
  if (!data || !crew || !environment || !view || !ready) return <div className="cg-bezel" />;

  const activeView = region && active ? view.regions[region].metrics.find((m) => m.key === active) : undefined;
  const mapQuery = new URLSearchParams({ crew: crew.id, ...(active ? { metric: active } : {}) }).toString();
  const dose = view.regions.whole_body.metrics;
  const doseDay = dose.find((m) => m.key === 'dose_mSv_day');
  const doseCum = dose.find((m) => m.key === 'dose_mSv_cum');
  const overall: Status = view.overall;

  return (
    <div className="cg-bezel">
      <div className="cg-screen">
        <header className="cg-top">
          <p className="cg-mark">
            e<sup>x</sup>
          </p>
          <Fact label="Mission">{data.crew.mission.name}</Fact>
          <Fact label="Day">{missionDay(data.crew)}</Fact>
          <Fact label="Environment">{data.crew.environments[environment].label}</Fact>
          {doseDay?.score && (
            <Fact label="Dose today">
              {fmt(doseDay.score.value)} <i>{doseDay.meta.unit}</i>
            </Fact>
          )}
          {doseCum?.score && (
            <Fact label="Career dose">
              {fmt(doseCum.score.value)} <i>/ {data.crew.career_limit_mSv} {doseCum.meta.unit}</i>
            </Fact>
          )}
          <div className="cg-top-status" data-status={overall} role="img" aria-label={`${crew.name}, ${STATUS_WORD[overall]}`}>
            <div>
              <p className="cg-label">Crew</p>
              <p className="cg-fact-value">{crew.name}</p>
            </div>
            <Shape status={overall} size={32} />
          </div>
        </header>

        <main className="cg-main">
          <Stage view={view} region={region} metric={active} metricStatus={activeView?.status ?? null} reduced={reduced} onRegion={pickRegion} />
          <aside className="cg-panel" data-status={region ? view.regions[region].status : overall}>
            {region && active ? (
              <Detail crew={crew} view={view} region={region} metric={active} reduced={reduced} day={missionDay(data.crew)} showSource={source} onSource={setSource} onMetric={setMetric} onBack={() => pickRegion(null)} />
            ) : (
              <Overview crew={crew} view={view} onRegion={pickRegion} />
            )}
          </aside>
        </main>

        <nav className="cg-bottom">
          <div className="cg-crew" role="tablist" aria-label="Crew">
            {data.crew.crew.map((c) => {
              const s = views?.get(c.id)?.overall ?? 'green';
              return (
                <button key={c.id} role="tab" aria-selected={c.id === crew.id} aria-label={`${c.name}, ${STATUS_WORD[s]}`} className="cg-crew-btn" data-status={s} onClick={() => pickCrew(c)}>
                  <span>{initials(c.name)}</span>
                  <Shape status={s} size={14} />
                </button>
              );
            })}
          </div>
          <div className="cg-nav">
            <span className="cg-nav-item" aria-current="page">
              <Icon name="body" size={28} />
              Body
            </span>
            {ARCH_ID && (
              <Link className="cg-nav-item" to={`/concepts/${ARCH_ID}?${mapQuery}`}>
                <Icon name="source" size={28} />
                Data map
              </Link>
            )}
          </div>
        </nav>

        <footer className="cg-foot">
          <p>
            {[...DISCLAIMERS, `Space weather data: ${data.storm.meta.data_credit}`, `Model: ${data.storm.meta.model}`].join('  ·  ')}
          </p>
          <p>{ANATOMY_CREDIT}</p>
        </footer>
      </div>
    </div>
  );
}
