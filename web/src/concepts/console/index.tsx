// Crew console: one main frame. The body model is the centrepiece with the selected crew
// member's vitals as arc gauges round it. Three levels, each with one Back:
//   1 whole body (status glows where the issue is, four numbers)
//   2 an organ (camera dives in, skin then muscle peel away, readings vs own baseline)
//   3 Deeper (cell close-up, trend, days running, z-score, one action)
// Numbers come from src/data and src/core; the body scene parts from components/body3d.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { DefaultLoadingManager } from 'three';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ConceptMeta } from '../../registry';
import { useMissionData } from '../../data/store';
import { useCabin } from '../../data/cabin';
import { cabinOverall } from '../../core/cabin';
import { sortedEvents } from '../../core/radiation';
import { DISCLAIMERS } from '../../components/Footer';
import { derive } from '../../components/body3d/derive';
import { TARGETS, type TargetId } from '../../components/body3d/targets';
import { Body, CameraRig, ViewShift, type Layers } from '../../components/body3d/BodyScene';
import { MicroView } from '../../components/body3d/Inspector';
import type { CrewData as SceneData, CrewMember as SceneMember } from '../../components/body3d/types';
import type { CrewMember, Status } from '../../data/types';
import { Globe } from './Globe';
import { crewView, fmt, GAUGES, METRIC_TARGET, rowOf, STATUS_WORD, TARGET_METRICS, type Row } from './model';
import './console.css';

export const meta: ConceptMeta = {
  title: 'Crew console',
  direction: 'Flight console: body centrepiece, arc gauges, three levels deep',
  surface: 'Crew Console',
};

// The 18.5 MB body model loads behind the loading screen: hold it open until the body is ready.
DefaultLoadingManager.itemStart('console-body');
let bodyHeld = true;
const releaseBody = () => {
  if (bodyHeld) {
    bodyHeld = false;
    DefaultLoadingManager.itemEnd('console-body');
  }
};

const S_VAR: Record<Status, string> = { green: 'rgb(var(--ok))', amber: 'rgb(var(--warn))', red: 'rgb(var(--crit))' };

/** Seat designations from the role field (UI layer only; no names on screen). */
function designations(crew: CrewMember[]): Record<string, string> {
  const out: Record<string, string> = {};
  let ms = 0;
  for (const c of crew) {
    const r = c.role.toLowerCase();
    if (r.includes('commander')) out[c.id] = 'CDR';
    else if (r.includes('pilot')) out[c.id] = 'PLT';
    else if (r.includes('engineer')) out[c.id] = 'FE';
    else out[c.id] = `MS${++ms}`;
  }
  return out;
}

function Mark({ s, size = 14 }: { s: Status | null; size?: number }) {
  const c = s ? S_VAR[s] : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {s === 'green' && <circle cx="7" cy="7" r="6" fill={c} />}
      {s === 'amber' && <path d="M7 1 L13.2 12.6 H0.8 Z" fill={c} />}
      {s === 'red' && <rect x="1" y="1" width="12" height="12" fill={c} />}
      {s == null && <circle cx="7" cy="7" r="5.5" fill="none" stroke={c} strokeWidth="1.5" />}
    </svg>
  );
}

/** 270 degree arc: her band as a thin segment, the value as the lit arc. */
function Arc({ r, size = 184 }: { r: Row; size?: number }) {
  const R = 80;
  const pt = (f: number) => {
    const a = ((135 + 270 * f) * Math.PI) / 180;
    return [100 + R * Math.cos(a), 100 + R * Math.sin(a)];
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0);
    const [x1, y1] = pt(f1);
    return `M${x0} ${y0} A${R} ${R} 0 ${270 * (f1 - f0) > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  let band: [number, number] | null = null;
  let v: number | null = null;
  if (r.value != null) {
    const lo = r.lo ?? r.value;
    const hi = r.hi ?? r.value;
    const span = Math.max(hi - lo, Math.abs(r.value) * 0.1, 1e-6);
    const min = Math.min(lo, r.value) - span * 0.6;
    const max = Math.max(hi, r.value) + span * 0.6;
    const p = (x: number) => (x - min) / (max - min);
    band = r.lo != null && r.hi != null ? [p(lo), p(hi)] : null;
    v = p(r.value);
  }
  const col = r.status === 'green' ? 'rgb(var(--ink))' : S_VAR[r.status];
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden style={{ overflow: 'visible' }}>
      <path d={arc(0, 1)} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.16" strokeWidth="2.5" strokeLinecap="round" />
      {band && <path d={arc(band[0], band[1])} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.3" strokeWidth="9" />}
      {v != null && <path d={arc(0, Math.max(0.002, v))} fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" />}
      {v != null && <circle cx={pt(v)[0]} cy={pt(v)[1]} r="6.5" fill={col} />}
      <text x="100" y="106" textAnchor="middle" className="arc-v">
        {fmt(r.value, r.digits)}
      </text>
      <text x="100" y="134" textAnchor="middle" className="arc-u">
        {r.value != null ? r.unit : ''}
      </text>
    </svg>
  );
}

/** Value against her band (mean +/- 2 sd) as one hairline. */
function Band({ r }: { r: Row }) {
  if (r.value == null || r.lo == null || r.hi == null) return null;
  const span = r.hi - r.lo;
  const min = Math.min(r.lo, r.value) - span * 0.5;
  const max = Math.max(r.hi, r.value) + span * 0.5;
  const p = (x: number) => ((x - min) / (max - min)) * 300;
  return (
    <svg viewBox="0 0 300 24" className="band" preserveAspectRatio="none" style={{ overflow: 'visible' }} aria-hidden>
      <line x1="0" x2="300" y1="12" y2="12" stroke="rgb(var(--ink))" strokeOpacity="0.2" />
      <rect x={p(r.lo)} width={p(r.hi) - p(r.lo)} y="8" height="8" fill="rgb(var(--ink))" fillOpacity="0.18" />
      {r.mean != null && <line x1={p(r.mean)} x2={p(r.mean)} y1="4" y2="20" stroke="rgb(var(--ink))" strokeOpacity="0.6" />}
      <circle cx={p(r.value)} cy="12" r="6" fill={r.status === 'green' ? 'rgb(var(--ink))' : S_VAR[r.status]} />
    </svg>
  );
}

/** Trend over the last three weeks with her band behind. */
function Trend({ r }: { r: Row }) {
  const vals = r.history.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals, r.lo ?? Infinity);
  const hi = Math.max(...vals, r.hi ?? -Infinity);
  const W = 400;
  const H = 90;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const n = r.history.length;
  const pts = r.history.map((v, i) => (v == null ? null : `${(i / (n - 1)) * W},${y(v)}`)).filter(Boolean).join(' ');
  const last = r.history[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend" preserveAspectRatio="none" style={{ overflow: 'visible' }} aria-hidden>
      {r.lo != null && r.hi != null && <rect x="0" width={W} y={y(r.hi)} height={Math.max(1, y(r.lo) - y(r.hi))} fill="rgb(var(--ink))" fillOpacity="0.09" />}
      <polyline points={pts} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {last != null && <circle cx={W} cy={y(last)} r="5" fill={r.status === 'green' ? 'rgb(var(--ink))' : S_VAR[r.status]} />}
    </svg>
  );
}

function Confirm({ open, title, body, onDone, onCancel }: { open: boolean; title: string; body: string; onDone: () => void; onCancel: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cf-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onCancel}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="cf-box"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{title}</h3>
            <p>{body}</p>
            <button type="button" className="cf-go" onClick={onDone} autoFocus>
              Done
            </button>
            <button type="button" className="cf-cancel" onClick={onCancel}>
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ICONS: Record<string, JSX.Element> = {
  Crew: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6" />,
  Vitals: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  Cabin: <path d="M4 9h11a3 3 0 1 0-3-3M4 15h14a3 3 0 1 1-3 3M4 12h8" />,
  Systems: <path d="M5 7a2 2 0 1 0 0-.01M19 7a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01M6.5 8.5 11 16.5M17.5 8.5 13 16.5M7 7h10" />,
};

export default function CrewConsole() {
  const { data } = useMissionData();
  const { cabin } = useCabin();
  const [params, setParams] = useSearchParams();
  const [ready, setReady] = useState(false);
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [peel, setPeel] = useState(0);

  const cd = data?.crew ?? null;
  const views = useMemo(() => (cd ? cd.crew.map((m) => crewView(cd, m)) : []), [cd]);
  const seat = useMemo(() => (cd ? designations(cd.crew) : {}), [cd]);
  // default: the crew member who needs a look most
  const worstId = useMemo(() => [...views].sort((a, b) => ({ green: 0, amber: 1, red: 2 })[b.overall] - ({ green: 0, amber: 1, red: 2 })[a.overall])[0]?.m.id, [views]);
  const crewId = params.get('crew') ?? worstId;
  const cv = views.find((v) => v.m.id === crewId) ?? views[0];
  const rawT = params.get('t');
  const target = rawT && rawT in TARGETS ? (rawT as TargetId) : null;
  const deep = !!target && params.get('deep') === '1';
  const level = deep ? 3 : target ? 2 : 1;

  const set = useCallback(
    (next: { crew?: string; t?: TargetId | null; deep?: boolean }) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.crew !== undefined) p.set('crew', next.crew);
          if (next.t !== undefined) (next.t ? p.set('t', next.t) : p.delete('t'));
          if (next.deep !== undefined) (next.deep ? p.set('deep', '1') : p.delete('deep'));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  // peel the outer layers one after the other when diving in
  useEffect(() => {
    if (!target) return setPeel(0);
    setPeel(1);
    const id = window.setTimeout(() => setPeel(2), 380);
    return () => window.clearTimeout(id);
  }, [target]);
  const layers: Layers = { skin: peel < 1, muscles: peel < 2, skeleton: true, vessels: true, organs: true };

  const sceneVis = useMemo(
    () => (cd && cv ? derive(cd as unknown as SceneData, cv.m as unknown as SceneMember, 'live').vis : null),
    [cd, cv],
  );

  const onReady = useCallback(() => {
    setReady(true);
    releaseBody();
  }, []);

  const T = target ? TARGETS[target] : null;
  const camView = T
    ? { key: `t-${T.id}`, target: T.box.c, offset: [0.25, 0.08, Math.max(0.75, Math.hypot(...T.box.h) * 3.6)] }
    : { key: 'all', target: [0, 0.95, 0], offset: [0, 0.12, 3.2] };

  const rows = cd && cv && target ? TARGET_METRICS[target].map((k) => rowOf(cd, cv.m, cv.scores, k)) : [];
  const lead = rows.slice().sort((a, b) => ({ green: 0, amber: 1, red: 2 })[b.status] - ({ green: 0, amber: 1, red: 2 })[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))[0];
  const gauges = cd && cv ? GAUGES.map((g) => ({ ...g, r: rowOf(cd, cv.m, cv.scores, g.k) })) : [];

  const cabinStatus = cabin ? cabinOverall(cabin.readings) : null;
  const latest = data ? sortedEvents(data.storm).at(-1) : undefined;
  const stormWord = latest ? ({ none: 'Quiet', watch: 'Watch', warning: 'Warning' } as const)[latest.alert_level] : 'No feed';
  const stormStatus: Status | null = latest ? ({ none: 'green', watch: 'amber', warning: 'red' } as const)[latest.alert_level] : null;
  const day = cd && cv ? cv.m.series.findIndex((r) => r.date === cd.mission.today) + 1 : null;
  const issueT = cv?.issue ? METRIC_TARGET[cv.issue.metric] ?? null : null;
  const actionKey = cv && lead ? `${cv.m.id}-${lead.k}` : '';

  return (
    <div className="cc-root" data-level={level}>
      {/* top bar: mark, crew, telemetry */}
      <header className="cc-top">
        <span className="cc-mark">
          e<span>x</span>
        </span>
        <nav className="cc-crew" aria-label="Crew">
          {views.map((v) => (
            <button key={v.m.id} type="button" aria-pressed={v.m.id === cv?.m.id} onClick={() => set({ crew: v.m.id, t: null, deep: false })}>
              <Mark s={v.overall} size={13} />
              {seat[v.m.id]}
            </button>
          ))}
        </nav>
        <div className="cc-tele">
          <span>
            <small>Day</small>
            {day ?? ''}
          </span>
          <span>
            <small>Link</small>
            {cabin ? (cabin.signal ? 'Up' : 'Down') : 'No feed'}
          </span>
        </div>
      </header>

      <main className="cc-main">
        <div className="cc-stage">
          <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.07, 3.2], fov: 32, near: 0.01, far: 50 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.35} />
            <directionalLight position={[2, 3, 3]} intensity={1.6} />
            <directionalLight position={[-3, 1.5, -2]} intensity={1.1} color="#7aa6ff" />
            <Environment resolution={128}>
              <Lightformer intensity={2} position={[0, 4, 4]} scale={[6, 2, 1]} />
              <Lightformer intensity={1} position={[-4, 1, -2]} scale={[2, 6, 1]} color="#88aaff" />
              <Lightformer intensity={0.8} position={[4, 0, 2]} scale={[2, 4, 1]} color="#ffd9c0" />
            </Environment>
            <Suspense fallback={null}>
              {sceneVis && <Body vis={sceneVis} lens={T ? T.lens : 'all'} layers={layers} onPick={(t) => set({ t, deep: false })} onReady={onReady} />}
            </Suspense>
            <CameraRig view={camView} />
            <ViewShift px={level === 1 ? 0 : 300} />
          </Canvas>
          {!ready && <p className="cc-wait">Loading body</p>}
        </div>

        {/* level 1: status + issue, four gauges round the body */}
        {cv && (
          <div className="cc-status" data-status={cv.overall}>
            <span className="cc-seat">{seat[cv.m.id]}</span>
            <span className="cc-word">
              <Mark s={cv.overall} size={24} />
              {STATUS_WORD[cv.overall]}
            </span>
            {level === 1 && cv.issue && issueT && (
              <button type="button" className="cc-issue" onClick={() => set({ t: issueT, deep: false })}>
                {rowOf(cd!, cv.m, cv.scores, cv.issue.metric).label}
                <span aria-hidden>Open</span>
              </button>
            )}
          </div>
        )}

        <AnimatePresence>
          {level === 1 &&
            gauges.map((g, i) => (
              <motion.button
                key={g.k}
                type="button"
                className={`cc-gauge cc-gauge-${i}`}
                data-status={g.r.status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => set({ t: g.t, deep: false })}
              >
                <Arc r={g.r} />
                <span className="cc-gauge-name">
                  <Mark s={g.r.status} size={11} />
                  {g.r.label}
                </span>
              </motion.button>
            ))}
        </AnimatePresence>

        {/* level 3: cell close-up */}
        <AnimatePresence>
          {level === 3 && T && sceneVis && (
            <motion.div className="cc-micro" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <MicroView target={T} vis={sceneVis} />
              <span className="cc-micro-cap">{T.microTitle}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* levels 2 and 3: the panel */}
        <AnimatePresence mode="wait">
          {level > 1 && T && cv && (
            <motion.aside
              key={`${T.id}-${level}`}
              className="cc-panel"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <button type="button" className="cc-back" onClick={() => (level === 3 ? set({ deep: false }) : set({ t: null }))}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                Back
              </button>
              <h2>{T.label}</h2>

              {level === 2 && (
                <>
                  <div className="cc-rows">
                    {rows.map((r) => (
                      <div key={r.k} className="cc-row" data-status={r.status}>
                        <div className="cc-row-head">
                          <Mark s={r.status} size={13} />
                          <span>{r.label}</span>
                          <small>{STATUS_WORD[r.status]}</small>
                        </div>
                        <div className="cc-row-num">
                          {fmt(r.value, r.digits)}
                          <small>{r.value != null ? r.unit : ''}</small>
                        </div>
                        <Band r={r} />
                        <p className="cc-usual">{r.mean != null ? `Usual ${fmt(r.mean, r.digits)}` : 'No baseline'}</p>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="cc-go" onClick={() => set({ deep: true })}>
                    Deeper
                  </button>
                </>
              )}

              {level === 3 && lead && (
                <>
                  <div className="cc-deep-head">
                    <Mark s={lead.status} size={14} />
                    <span>{lead.label}</span>
                    <b>
                      {fmt(lead.value, lead.digits)} <small>{lead.value != null ? lead.unit : ''}</small>
                    </b>
                  </div>
                  <Trend r={lead} />
                  <dl className="cc-stats">
                    <div>
                      <dt>Days running</dt>
                      <dd>{lead.running}</dd>
                    </div>
                    <div>
                      <dt>z-score</dt>
                      <dd>{lead.z == null ? 'None' : `${lead.z >= 0 ? '+' : '-'}${Math.abs(lead.z).toFixed(1)}`}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="cc-go"
                    data-done={done[actionKey] || undefined}
                    onClick={() => (done[actionKey] ? setDone((d) => ({ ...d, [actionKey]: false })) : setAsking(true))}
                  >
                    {done[actionKey] ? 'Logged' : lead.status === 'red' ? 'Call surgeon' : lead.status === 'amber' ? 'Re-measure' : 'Log check'}
                  </button>
                </>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* quiet side readouts */}
        {level === 1 && (
          <>
            <Link to="/cabin" className="cc-side cc-side-left" data-status={cabinStatus ?? 'none'}>
              <small>Cabin</small>
              <span>
                <Mark s={cabinStatus} size={12} />
                {cabinStatus ? STATUS_WORD[cabinStatus] : 'No feed'}
              </span>
            </Link>
            <div className="cc-side cc-side-right" data-status={stormStatus ?? 'none'}>
              <div className="cc-globe">
                <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 4.9], fov: 35 }}>
                  <ambientLight intensity={0.25} />
                  <directionalLight position={[3, 1, 2]} intensity={2.2} />
                  <Suspense fallback={null}>
                    <Globe />
                  </Suspense>
                </Canvas>
              </div>
              <small>Storm</small>
              <span>
                <Mark s={stormStatus} size={12} />
                {stormWord}
              </span>
            </div>
          </>
        )}
      </main>

      {/* slim icon bar */}
      <nav className="cc-bar" aria-label="Screens">
        {(['Crew', 'Vitals', 'Cabin', 'Systems'] as const).map((n) => {
          const inner = (
            <>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICONS[n]}
              </svg>
              {n}
            </>
          );
          if (n === 'Crew')
            return (
              <button key={n} type="button" aria-pressed="true" onClick={() => set({ t: null, deep: false })}>
                {inner}
              </button>
            );
          if (n === 'Vitals')
            return (
              <Link key={n} to="/body">
                {inner}
              </Link>
            );
          if (n === 'Cabin')
            return (
              <Link key={n} to="/cabin">
                {inner}
              </Link>
            );
          return (
            <button key={n} type="button" aria-disabled="true" className="cc-off">
              {inner}
            </button>
          );
        })}
      </nav>

      <footer className="cc-credits">
        {[...DISCLAIMERS, data ? `Space weather data: ${data.storm.meta.data_credit}` : ''].filter(Boolean).join('  ·  ')}
        <br />
        Anatomy: BodyParts3D 4.0, DBCLS, CC BY 4.0  ·  Earth: NASA Blue Marble and Black Marble, public domain  ·  Video: NASA, KSC-20190225-MH-SPX01-0001, CC0
      </footer>

      {lead && T && (
        <Confirm
          open={asking}
          title={lead.status === 'red' ? 'Call surgeon' : lead.status === 'amber' ? 'Re-measure' : 'Log check'}
          body={lead.action}
          onDone={() => {
            setDone((d) => ({ ...d, [actionKey]: true }));
            setAsking(false);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  );
}
