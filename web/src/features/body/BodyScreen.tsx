// 01 Body. The annotated body of one crew member: each plate sits where its
// structure is, flagged plates carry their reading on a leader. Every number
// comes from crew_data.json through core/scoring; every position from
// docs/body-map.json; the model from ./model (the swap point).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import type { MetricKey, Region } from '../../data/types';
import { Shape, STATUS_WORD } from '../../ui/status';
import { MarginNote } from './MarginNote';
import { PlateBody, type BodyFrame } from './PlateBody';
import { buildPlates, doseFraction, firstSentence, fmt, reviewOrder, viewDegOf, type PlateId } from './plates';
import './body.css';

/** Half-width of the body model in metres (whole_body bounding box), for label stand-off. */
const BODY_HALF_M = 0.333;
/** Horizontal run of a leader between a label and the body outline, px. */
const LEAD = 40;
/** Gap between stacked labels, px (crew-ux rule 3). */
const GAP = 12;
/** Half a 72 px hit target plus its gap: targets closer than this to an edge are switched off. */
const HIT_INSET = 44;

interface ActionState {
  remeasure?: boolean;
  flagged?: boolean;
  escalated?: boolean;
}

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  return { crew: q.get('crew'), plate: q.get('plate') as PlateId | null, metric: q.get('metric') as MetricKey | null };
}

function Arrow({ dir }: { dir: 'left' | 'right' | 'up' }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d={dir === 'up' ? 'M14 24V5M6 12l8-8 8 8' : dir === 'left' ? 'M24 14H5M12 6l-8 8 8 8' : 'M4 14h19M16 6l8 8-8 8'} />
    </svg>
  );
}

export default function BodyScreen() {
  const { data, loadState, error } = useMissionData();
  const member = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const setCrew = useMissionStore((s) => s.setSelectedCrewId);
  const setRegion = useMissionStore((s) => s.setSelectedRegion);

  const initial = useMemo(readUrl, []);
  const [selected, setSelected] = useState<PlateId | null>(initial.plate);
  const [metric, setMetric] = useState<MetricKey | null>(initial.metric);
  const [turn, setTurn] = useState(0);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [confirming, setConfirming] = useState(false);
  const reducedMotion = !!useReducedMotion();

  // Crew from the URL once the file is loaded.
  const urlCrewDone = useRef(false);
  useEffect(() => {
    if (!data || urlCrewDone.current) return;
    urlCrewDone.current = true;
    if (initial.crew && data.crew.crew.some((c) => c.id === initial.crew)) setCrew(initial.crew);
  }, [data, initial.crew, setCrew]);

  const plates = useMemo(() => (data && member && environment ? buildPlates(member, data.crew, environment) : []), [data, member, environment]);
  const order = useMemo(() => reviewOrder(plates), [plates]);
  const plate = plates.find((p) => p.id === selected) ?? null;
  const shownMetric = plate ? (plate.scores.some((s) => s.metric === metric) ? metric! : plate.primary) : null;

  // State that matters lives in the URL.
  useEffect(() => {
    if (!member) return;
    const q = new URLSearchParams();
    q.set('crew', member.id);
    if (plate) q.set('plate', plate.id);
    if (plate && metric) q.set('metric', metric);
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`);
  }, [member, plate, metric]);

  const select = useCallback(
    (id: PlateId | null, m: MetricKey | null = null) => {
      setSelected(id);
      setMetric(m);
      setConfirming(false);
      const p = plates.find((x) => x.id === id);
      if (p && data) {
        setTurn(viewDegOf(m ?? p.primary));
        setRegion(data.crew.metrics[p.primary].body_region as Region);
      } else setRegion(null);
    },
    [plates, data, setRegion],
  );

  const step = (dir: 1 | -1) => {
    if (!order.length) return;
    const i = order.findIndex((p) => p.id === plate?.id);
    const next = i < 0 ? (dir === 1 ? 0 : order.length - 1) : (i + dir + order.length) % order.length;
    select(order[next].id);
  };

  /* ------------------------------------------------ labels, leaders and hit targets, written per frame through refs */
  const stage = useRef<HTMLDivElement>(null);
  const noteCol = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const turnBox = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<PlateId, HTMLElement>());
  const leaders = useRef(new Map<PlateId, SVGPathElement>());
  const marks = useRef(new Map<PlateId, SVGGElement>());
  const hits = useRef(new Map<PlateId, HTMLElement>());
  const shiftPx = useRef(0);
  const live = useRef({ selected: plate?.id ?? null, plates });
  live.current = { selected: plate?.id ?? null, plates };

  const onProject = useCallback((pts: Record<PlateId, { x: number; y: number }>, frame: BodyFrame) => {
    const root = stage.current;
    if (!root) return;
    const { selected: sel, plates: all } = live.current;
    // Read everything first, then write.
    const sr = root.getBoundingClientRect();
    const w = sr.width;
    const h = sr.height;
    const noteRight = sel && noteCol.current ? noteCol.current.getBoundingClientRect().right - sr.left : 0;
    const tr = title.current && title.current.offsetParent ? title.current.getBoundingClientRect() : null;
    const ur = turnBox.current?.getBoundingClientRect() ?? null;
    const sizes = new Map<PlateId, { w: number; h: number }>();
    for (const p of all) {
      const el = labels.current.get(p.id);
      if (el) sizes.set(p.id, { w: el.offsetWidth, h: el.offsetHeight });
    }

    // A selection keeps the body clear of the note.
    shiftPx.current = noteRight / 2;

    const reach = BODY_HALF_M * frame.scale + 20;
    const elbow = { left: frame.cx - reach, right: frame.cx + reach };

    for (const side of ['left', 'right'] as const) {
      const items = all
        .filter((p) => p.side === side && pts[p.id] && sizes.has(p.id))
        .map((p) => ({ id: p.id, ...pts[p.id], ...sizes.get(p.id)!, ty: 0 }))
        .sort((a, b) => a.y - b.y);
      if (!items.length) continue;
      const widest = Math.max(...items.map((i) => i.w));
      // Keep labels clear of the title block (top left) and the turn control (bottom right).
      let top = 8;
      let bottom = h - 8;
      if (side === 'left' && tr && tr.right - sr.left + 16 > elbow.left - LEAD - widest) top = tr.bottom - sr.top + 16;
      if (side === 'right' && ur && ur.left - sr.left - 16 < elbow.right + LEAD + widest) bottom = ur.top - sr.top - 16;
      let prevEdge = top - GAP;
      for (const it of items) {
        it.ty = Math.max(it.y, prevEdge + GAP + it.h / 2);
        prevEdge = it.ty + it.h / 2;
      }
      let nextEdge = bottom + GAP;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.ty = Math.min(it.ty, nextEdge - GAP - it.h / 2);
        nextEdge = it.ty - it.h / 2;
      }
      for (const it of items) {
        const el = labels.current.get(it.id)!;
        const edge = side === 'left' ? elbow.left - LEAD : elbow.right + LEAD;
        const lx = side === 'left' ? edge - it.w : edge;
        el.style.transform = `translate(${lx.toFixed(1)}px, ${(it.ty - it.h / 2).toFixed(1)}px)`;
        if (it.id !== sel) {
          const end = side === 'left' ? it.x - 8 : it.x + 8;
          leaders.current.get(it.id)?.setAttribute('d', `M${edge.toFixed(1)} ${it.ty.toFixed(1)}H${elbow[side].toFixed(1)}L${end.toFixed(1)} ${it.y.toFixed(1)}`);
        }
      }
    }

    for (const p of all) {
      const pt = pts[p.id];
      if (!pt) continue;
      const clear = pt.x > noteRight + 12;
      const mark = marks.current.get(p.id);
      if (mark) {
        mark.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
        mark.style.visibility = clear ? 'visible' : 'hidden';
      }
      if (p.id === sel) {
        // The selected plate: one horizontal rule from the note's edge to the anchor.
        leaders.current.get(p.id)?.setAttribute('d', clear ? `M${noteRight} ${pt.y.toFixed(1)}H${(pt.x - 10).toFixed(1)}` : '');
      }
      const hit = hits.current.get(p.id);
      if (hit) {
        // Targets that would reach under the note, the action row or the turn control are switched off.
        const inside = pt.x > noteRight + HIT_INSET && pt.x < w - HIT_INSET && pt.y > HIT_INSET && pt.y < h - HIT_INSET;
        const onTurn = !!ur && pt.x > ur.left - sr.left - HIT_INSET && pt.y > ur.top - sr.top - HIT_INSET;
        // 72 px wherever the body is drawn large enough; on a small body the targets shrink to
        // stay apart, and the plate labels remain the full-size targets.
        let near = Infinity;
        for (const o of all) if (o.id !== p.id && pts[o.id]) near = Math.min(near, Math.hypot(pts[o.id].x - pt.x, pts[o.id].y - pt.y));
        const d = Math.max(40, Math.min(72, Math.floor(near) - 2));
        hit.style.width = hit.style.height = `${d}px`;
        hit.style.transform = `translate(${(pt.x - d / 2).toFixed(1)}px, ${(pt.y - d / 2).toFixed(1)}px)`;
        hit.style.visibility = inside && !onTurn ? 'visible' : 'hidden';
      }
    }
  }, []);

  if (loadState === 'error') return <p className="fr-root fr-error">{error}</p>;
  if (!data || !member || !environment) return <div className="fr-root" />;

  const crew = data.crew;
  const overall = order[0]?.status ?? 'green';

  const actionKey = plate && shownMetric ? `${member.id}:${shownMetric}` : '';
  const act = actions[actionKey] ?? {};
  const setAct = (patch: ActionState) => setActions((a) => ({ ...a, [actionKey]: { ...a[actionKey], ...patch } }));
  const shownStatus = plate?.scores.find((s) => s.metric === shownMetric)?.status ?? 'green';
  // Only readings with a personal baseline can be taken again; dose totals and estimates cannot.
  const measurable = !!shownMetric && !!member.baseline[shownMetric];
  const nextStep = shownMetric && shownStatus !== 'green' ? firstSentence(crew.metrics[shownMetric].actions[shownStatus]) : null;
  const after = plate ? order[(order.findIndex((p) => p.id === plate.id) + 1) % order.length] : null;
  // Back: close the open plate; with none open, face the body front.
  const back = () => (plate ? select(null) : setTurn(0));

  return (
    <div className={`fr-root fr-scope${plate ? ' has-selection' : ''}`}>
      <main className="fr-stage" ref={stage}>
        <div className="fr-canvas">
          <Canvas
            camera={{ position: [0, 0.875, 3.85], fov: 30, near: 0.1, far: 20 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => plate && select(null)}
          >
            <Suspense fallback={null}>
              <PlateBody
                plates={plates}
                selected={plate?.id ?? null}
                metric={shownMetric}
                dose={doseFraction(member, crew)}
                turnDeg={turn}
                reducedMotion={reducedMotion}
                neutral={false}
                shiftPx={shiftPx}
                onProject={onProject}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* Leader rules and anchor marks, drawn over the plate. */}
        <svg className="fr-overlay" aria-hidden="true">
          {plates.map((p) => (
            <g key={p.id} className={`fr-leader-g${p.id === plate?.id ? ' is-selected' : ''}${p.status !== 'green' ? ' is-flagged' : ''}`}>
              <path className="fr-leader" ref={(el) => void (el ? leaders.current.set(p.id, el) : leaders.current.delete(p.id))} />
              <g className="fr-mark-g" ref={(el) => void (el ? marks.current.set(p.id, el) : marks.current.delete(p.id))}>
                {p.status === 'green' && <circle className="fr-mark" r="5" />}
                {p.status === 'amber' && <path className="fr-mark fr-fill-amber fr-breathe-amber" d="M0 -9 9 8H-9Z" />}
                {p.status === 'red' && <rect className="fr-mark fr-fill-red fr-breathe-red" x="-8" y="-8" width="16" height="16" />}
              </g>
            </g>
          ))}
        </svg>

        {plates.map((p) => (
            <button
              key={p.id}
              className="fr-hit"
              aria-label={`${p.name}, ${STATUS_WORD[p.status]}`}
              ref={(el) => void (el ? hits.current.set(p.id, el) : hits.current.delete(p.id))}
              onClick={() => select(p.id)}
            />
          ))}

        {/* Plate labels, each at its own body height, on the side its structure sits. */}
        {plates.map((p, i) => {
            const s = p.scores[0];
            const flagged = p.status !== 'green';
            return (
              <button
                key={p.id}
                className={`fr-plate fr-plate-${p.side}${flagged ? ' is-flagged' : ''}`}
                style={{ animationDelay: `${i * 40}ms` }}
                tabIndex={plate ? -1 : 0}
                ref={(el) => void (el ? labels.current.set(p.id, el) : labels.current.delete(p.id))}
                onClick={() => select(p.id)}
              >
                <span className="fr-plate-name">
                  <span className="fr-mono">{p.no}</span>
                  {p.name}
                </span>
                {flagged && s && (
                  <span className="fr-plate-val">
                    {fmt(s.value)} <small>{crew.metrics[s.metric].unit}</small>
                  </span>
                )}
                <span className={`fr-plate-status fr-text-${p.status}`}>
                  <Shape status={p.status} size={flagged ? 18 : 14} />
                  {STATUS_WORD[p.status]}
                </span>
              </button>
            );
          })}

        <>
            <div className="fr-title" ref={title} key={`title-${member.id}`}>
              <p className="fr-label">{member.role}</p>
              <h1 className="fr-person">{member.name}</h1>
              <p className={`fr-overall fr-text-${overall}`}>
                <Shape status={overall} size={26} />
                {STATUS_WORD[overall]}
              </p>
            </div>
            <section className="fr-notecol" ref={noteCol} aria-live="polite">
              <AnimatePresence mode="wait">
              {plate && shownMetric && (
                <motion.div
                  key={plate.id}
                  initial={reducedMotion ? false : { opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, x: -8, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                <MarginNote
                  plate={plate}
                  metric={shownMetric}
                  member={member}
                  data={crew}
                  environment={environment}
                  remeasure={!!act.remeasure}
                  onMetric={(m) => select(plate.id, m)}
                />
                </motion.div>
              )}
              </AnimatePresence>
            </section>
            <div className="fr-turn" ref={turnBox}>
              <button aria-label="Turn left" onClick={() => setTurn((t) => t - 45)}>
                <Arrow dir="left" />
              </button>
              <span className="fr-label">Turn</span>
              <button aria-label="Turn right" onClick={() => setTurn((t) => t + 45)}>
                <Arrow dir="right" />
              </button>
            </div>
        </>
      </main>

      {/* Bottom edge: every control the arm has to reach, one filled action at a time. */}
      <div className="fr-bar">
        <>
            <button className="fr-sq" onClick={back}>
              <Arrow dir="up" />
              <span>{plate ? 'Body' : 'Front'}</span>
            </button>
            {!plate ? (
              <button className={`fr-act ${overall === 'green' ? 'fr-act-quiet' : 'fr-act-primary'}`} onClick={() => step(1)}>
                <span className="fr-act-main">
                  <b>Review {order[0]?.name}</b>
                </span>
                <span className="fr-act-hint">
                  <Shape status={overall} size={16} />
                  {STATUS_WORD[overall]}
                </span>
              </button>
            ) : shownStatus === 'green' ? (
              <button className="fr-act fr-act-quiet" onClick={() => step(1)}>
                <span className="fr-act-main">
                  <b>Next</b>
                </span>
                <span className="fr-act-hint">{after?.name}</span>
              </button>
            ) : confirming ? (
              <>
                <button className="fr-act fr-act-quiet" onClick={() => setConfirming(false)}>
                  <span className="fr-act-main">
                    <b>Cancel</b>
                  </span>
                </button>
                <button
                  className="fr-act fr-act-crit"
                  onClick={() => {
                    setAct({ escalated: true });
                    setConfirming(false);
                  }}
                >
                  <Shape status="red" size={20} />
                  <span className="fr-act-main">
                    <b>Confirm escalate</b>
                    <small>{nextStep}</small>
                  </span>
                </button>
              </>
            ) : shownStatus === 'red' ? (
              <>
                {act.escalated ? (
                  <button className="fr-act fr-act-done" onClick={() => setAct({ escalated: false })}>
                    <Shape status="red" size={20} />
                    <span className="fr-act-main">
                      <b>Escalated</b>
                      <small>{nextStep}</small>
                    </span>
                    <span className="fr-act-hint">Undo</span>
                  </button>
                ) : (
                  <button className="fr-act fr-act-crit" onClick={() => setConfirming(true)}>
                    <Shape status="red" size={20} />
                    <span className="fr-act-main">
                      <b>Escalate</b>
                      <small>{nextStep}</small>
                    </span>
                  </button>
                )}
                {measurable && (
                  <button className="fr-act fr-act-second" onClick={() => setAct({ remeasure: !act.remeasure })}>
                    <span className="fr-act-main">
                      <b>{act.remeasure ? 'Re-measure requested' : 'Re-measure'}</b>
                    </span>
                    {act.remeasure && <span className="fr-act-hint">Undo</span>}
                  </button>
                )}
              </>
            ) : act.flagged ? (
              <button className="fr-act fr-act-done" onClick={() => setAct({ flagged: false })}>
                <Shape status="amber" size={20} />
                <span className="fr-act-main">
                  <b>Flagged for conference</b>
                  <small>{nextStep}</small>
                </span>
                <span className="fr-act-hint">Undo</span>
              </button>
            ) : measurable && !act.remeasure ? (
              <button className="fr-act fr-act-primary" onClick={() => setAct({ remeasure: true })}>
                <span className="fr-act-main">
                  <b>Re-measure</b>
                  <small>{nextStep}</small>
                </span>
              </button>
            ) : (
              <>
                <button className="fr-act fr-act-primary" onClick={() => setAct({ flagged: true })}>
                  <span className="fr-act-main">
                    <b>Flag for conference</b>
                    <small>{act.remeasure ? 'Re-measure requested' : nextStep}</small>
                  </span>
                </button>
                {act.remeasure && (
                  <button className="fr-sq fr-sq-text" onClick={() => setAct({ remeasure: false })}>
                    <span>Undo</span>
                  </button>
                )}
              </>
            )}
            {plate && (
              <>
                <button className="fr-sq" aria-label="Previous region" onClick={() => step(-1)}>
                  <Arrow dir="left" />
                  <span>Prev</span>
                </button>
                <button className="fr-sq" aria-label="Next region" onClick={() => step(1)}>
                  <Arrow dir="right" />
                  <span>Next</span>
                </button>
              </>
            )}
        </>
      </div>
    </div>
  );
}
