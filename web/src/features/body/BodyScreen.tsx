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
/** Horizontal run of a leader between its ring node and the label, px. */
const LEAD = 28;
/** Radius of the orbit ring the plate nodes sit on, metres at the body plane. */
const ORBIT_M = 0.8;
/** Labels stay within this share of the orbit radius above and below the centre. */
const ORBIT_SPAN = 0.94;
/** Tick ring: 72 ticks, a long one every 30 degrees, drawn at unit radius and scaled. */
const TICKS = (() => {
  let d = '';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = i % 6 === 0 ? 0.955 : 0.978;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    d += `M${(s * r0).toFixed(4)} ${(c * r0).toFixed(4)}L${s.toFixed(4)} ${c.toFixed(4)}`;
  }
  return d;
})();
/** Gap between stacked labels, px (crew-ux rule 3). */
const GAP = 12;
/** Half a 72 px hit target plus its gap: targets closer than this to an edge are switched off. */
const HIT_INSET = 44;
const THREE_DEG = 180 / Math.PI;

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
    if (initial.crew && data.crew.crew.some((c) => c.id === initial.crew)) {
      keepSelection.current = true;
      setCrew(initial.crew);
    }
  }, [data, initial.crew, setCrew]);

  // Another crew member: start from the front, nothing open.
  const keepSelection = useRef(false);
  const lastCrew = useRef<string | null>(null);
  useEffect(() => {
    const id = member?.id ?? null;
    if (lastCrew.current && id !== lastCrew.current) {
      if (!keepSelection.current) {
        setSelected(null);
        setMetric(null);
        setConfirming(false);
        setTurn(0);
      }
      keepSelection.current = false;
    }
    lastCrew.current = id;
  }, [member?.id]);

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

  // Keyboard: Esc closes the open plate, arrows step through the review order.
  const keys = useRef({ step, select, open: !!plate });
  keys.current = { step, select, open: !!plate };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const k = keys.current;
      if (e.key === 'Escape' && k.open) k.select(null);
      else if (k.open && e.key === 'ArrowRight') k.step(1);
      else if (k.open && e.key === 'ArrowLeft') k.step(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  /* ------------------------------------------------ labels, leaders and hit targets, written per frame through refs */
  const stage = useRef<HTMLDivElement>(null);
  const noteCol = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const turnBox = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<PlateId, HTMLElement>());
  const leaders = useRef(new Map<PlateId, SVGPathElement>());
  const marks = useRef(new Map<PlateId, SVGGElement>());
  const hits = useRef(new Map<PlateId, HTMLElement>());
  const nodes = useRef(new Map<PlateId, SVGGElement>());
  const rings = useRef<SVGGElement>(null);
  const ticks = useRef<SVGPathElement>(null);
  const heading = useRef<SVGTextElement>(null);
  const frontLabel = useRef<HTMLSpanElement>(null);
  const reticle = useRef<SVGGElement>(null);
  const lastR = useRef(0);
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

    // The orbit: concentric hairline rings centred on the body; the plate nodes sit on the middle one.
    const R = ORBIT_M * frame.scale;
    const { cx, cy } = frame;
    const rg = rings.current;
    if (rg) {
      rg.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
      if (Math.abs(R - lastR.current) > 0.5) {
        lastR.current = R;
        rg.querySelectorAll<SVGCircleElement>('circle[data-k]').forEach((c) => c.setAttribute('r', (R * Number(c.dataset.k)).toFixed(1)));
        heading.current?.setAttribute('y', (-R * 1.1 - 14).toFixed(1));
      }
      const deg = THREE_DEG * -frame.turn;
      ticks.current?.setAttribute('transform', `rotate(${deg.toFixed(2)}) scale(${(R * 1.1).toFixed(1)})`);
      const shown = (((Math.round(deg) % 360) + 360) % 360).toString().padStart(3, '0');
      if (heading.current && heading.current.textContent !== `${shown}°`) heading.current.textContent = `${shown}°`;
      if (frontLabel.current && frontLabel.current.textContent !== `${shown}°`) frontLabel.current.textContent = `${shown}°`;
    }
    const reach = BODY_HALF_M * frame.scale * 0.5;

    for (const side of ['left', 'right'] as const) {
      const items = all
        .filter((p) => p.side === side && pts[p.id] && sizes.has(p.id))
        .map((p) => ({ id: p.id, ...pts[p.id], ...sizes.get(p.id)!, ty: 0 }))
        .sort((a, b) => a.y - b.y);
      if (!items.length) continue;
      const dir = side === 'left' ? -1 : 1;
      // Where a label of width lw sits when its line is at height ty: on the orbit, clear of the body.
      const nodeAt = (ty: number) => cx + dir * Math.max(reach, Math.sqrt(Math.max(0, R * R - (ty - cy) ** 2)));
      const leftAt = (ty: number, lw: number) => Math.max(8, Math.min(w - lw - 8, nodeAt(ty) + dir * LEAD - (side === 'left' ? lw : 0)));
      // Keep labels on the orbit, clear of the title block (top left) and the turn control (bottom right).
      const top = Math.max(8, cy - R * ORBIT_SPAN);
      const bottom = Math.min(h - 8, cy + R * ORBIT_SPAN);
      const tBottom = tr ? tr.bottom - sr.top + 16 : -1;
      const tRight = tr ? tr.right - sr.left + 16 : -1;
      const uTop = ur ? ur.top - sr.top - 16 : h + 1;
      const uLeft = ur ? ur.left - sr.left - 16 : w + 1;
      let prevEdge = top - GAP;
      for (const it of items) {
        let ty = Math.max(it.y, prevEdge + GAP + it.h / 2);
        if (side === 'left' && ty - it.h / 2 < tBottom && leftAt(ty, it.w) < tRight) ty = tBottom + it.h / 2;
        it.ty = ty;
        prevEdge = it.ty + it.h / 2;
      }
      let nextEdge = bottom + GAP;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        let ty = Math.min(it.ty, nextEdge - GAP - it.h / 2);
        if (side === 'right' && ty + it.h / 2 > uTop && leftAt(ty, it.w) + it.w > uLeft) ty = uTop - it.h / 2;
        it.ty = ty;
        nextEdge = it.ty - it.h / 2;
      }
      for (const it of items) {
        const el = labels.current.get(it.id)!;
        const nodeX = nodeAt(it.ty);
        const edge = nodeX + dir * LEAD;
        const lx = leftAt(it.ty, it.w);
        el.style.transform = `translate(${lx.toFixed(1)}px, ${(it.ty - it.h / 2).toFixed(1)}px)`;
        const node = nodes.current.get(it.id);
        if (node) node.setAttribute('transform', `translate(${nodeX.toFixed(1)} ${it.ty.toFixed(1)})`);
        if (it.id !== sel) {
          // Anchor to node (the callout), node to label (the run).
          const ang = Math.atan2(it.ty - it.y, nodeX - it.x);
          const sx = it.x + Math.cos(ang) * 6;
          const sy = it.y + Math.sin(ang) * 6;
          const ex = nodeX - Math.cos(ang) * 10;
          const ey = it.ty - Math.sin(ang) * 10;
          leaders.current
            .get(it.id)
            ?.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}M${(nodeX + dir * 10).toFixed(1)} ${it.ty.toFixed(1)}H${edge.toFixed(1)}`);
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
        // The selected plate: one horizontal rule from the panel's edge to the anchor, and a reticle on it.
        leaders.current.get(p.id)?.setAttribute('d', clear ? `M${noteRight} ${pt.y.toFixed(1)}H${(pt.x - 40).toFixed(1)}` : '');
        reticle.current?.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
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
  const flaggedCount = plates.filter((p) => p.status !== 'green').length;
  const nameWords = member.name.split(' ');
  const surname = nameWords.pop()!;

  const actionKey = plate && shownMetric ? `${member.id}:${shownMetric}` : '';
  const act = actions[actionKey] ?? {};
  const setAct = (patch: ActionState) => setActions((a) => ({ ...a, [actionKey]: { ...a[actionKey], ...patch } }));
  const shownStatus = plate?.scores.find((s) => s.metric === shownMetric)?.status ?? 'green';
  // Only readings with a personal baseline can be taken again; dose totals and estimates cannot.
  const measurable = !!shownMetric && !!member.baseline[shownMetric];
  const nextStep = shownMetric && shownStatus !== 'green' ? firstSentence(crew.metrics[shownMetric].actions[shownStatus]) : null;
  const after = plate ? order[(order.findIndex((p) => p.id === plate.id) + 1) % order.length] : null;
  const byNo = [...plates].sort((a, b) => a.no.localeCompare(b.no));

  return (
    <div className={`fr-root fr-scope${plate ? ' has-selection' : ''}`}>
      <section className="fr-stage" ref={stage} aria-label="Body">
        <div className="fr-haze" aria-hidden="true" />
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

        {/* Orbit rings, leader callouts, ring nodes and anchor marks, drawn over the body. */}
        <svg className="fr-overlay" aria-hidden="true" key={`ov-${member.id}`}>
          <g className="fr-rings" ref={rings}>
            <circle className="fr-ring fr-ring-inner" data-k="0.6" pathLength={1} />
            <circle className="fr-ring fr-ring-orbit" data-k="1" pathLength={1} />
            <circle className="fr-ring fr-ring-outer" data-k="1.42" pathLength={1} />
            <path className="fr-ticks" ref={ticks} d={TICKS} vectorEffect="non-scaling-stroke" />
            <text className="fr-heading" ref={heading} textAnchor="middle">000°</text>
          </g>
          {plates.map((p, i) => (
            <g key={p.id} className={`fr-leader-g${p.id === plate?.id ? ' is-selected' : ''}${p.status !== 'green' ? ' is-flagged' : ''}`} style={{ ['--i' as string]: i }}>
              <path className="fr-leader" pathLength={1} ref={(el) => void (el ? leaders.current.set(p.id, el) : leaders.current.delete(p.id))} />
              <g className="fr-node-g" ref={(el) => void (el ? nodes.current.set(p.id, el) : nodes.current.delete(p.id))}>
                {p.status === 'green' && <circle className="fr-node" r="7" />}
                {p.status === 'amber' && <path className="fr-node fr-fill-amber fr-breathe-amber" d="M0 -10 10 8H-10Z" />}
                {p.status === 'red' && <rect className="fr-node fr-fill-red fr-breathe-red" x="-8" y="-8" width="16" height="16" />}
              </g>
              <g className="fr-mark-g" ref={(el) => void (el ? marks.current.set(p.id, el) : marks.current.delete(p.id))}>
                <circle className={`fr-anchor fr-anchor-${p.status}`} r="3.5" />
              </g>
            </g>
          ))}
          {plate && (
            <g className="fr-reticle" ref={reticle} key={`ret-${plate.id}`}>
              <circle r="30" pathLength={1} />
              <path d="M0 -42V-34M0 34V42M-42 0H-34M34 0H42" />
            </g>
          )}
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

        {/* Plate labels, each on the orbit at its own body height, on the side its structure sits. */}
        {plates.map((p, i) => {
          const s = p.scores[0];
          const flagged = p.status !== 'green';
          return (
            <button
              key={`${member.id}-${p.id}`}
              className={`fr-plate fr-plate-${p.side}${flagged ? ' is-flagged' : ''}`}
              style={{ animationDelay: `${240 + i * 50}ms` }}
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

        <div className="fr-title" ref={title} key={`title-${member.id}`}>
          <p className="fr-kicker">
            <span className="fr-mono">01</span>
            <span className="fr-mono fr-kicker-of">/02</span>
            <span className="fr-label">{member.role}</span>
          </p>
          <h1 className="fr-person">
            <span className="fx-mask"><span>{nameWords.join(' ')}</span></span>
            <span className="fx-mask"><span style={{ animationDelay: '60ms' }}>{surname}.</span></span>
          </h1>
          <p className={`fr-overall fr-text-${overall}`}>
            <Shape status={overall} size={30} />
            {STATUS_WORD[overall]}
          </p>
          <p className="fr-mono fr-tally">
            {flaggedCount === 0 ? `All ${plates.length} in range` : `${flaggedCount} of ${plates.length} flagged`}
          </p>
        </div>

        <section className="fr-notecol" ref={noteCol} aria-live="polite">
          <AnimatePresence mode="wait">
            {plate && shownMetric && (
              <motion.div
                key={plate.id}
                className="fr-panel"
                initial={reducedMotion ? false : { opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, x: -12, transition: { duration: 0.14 } }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <MarginNote
                  plate={plate}
                  metric={shownMetric}
                  member={member}
                  data={crew}
                  environment={environment}
                  remeasure={!!act.remeasure}
                  onMetric={(m) => select(plate.id, m)}
                  onClose={() => select(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="fr-turn" ref={turnBox}>
          <button aria-label="Turn left" onClick={() => setTurn((t) => t - 45)}>
            <Arrow dir="left" />
          </button>
          <button className="fr-front" aria-label="Face front" onClick={() => setTurn(0)}>
            <span className="fr-mono" ref={frontLabel}>000°</span>
            <span className="fr-label">Front</span>
          </button>
          <button aria-label="Turn right" onClick={() => setTurn((t) => t + 45)}>
            <Arrow dir="right" />
          </button>
        </div>
      </section>

      {/* Bottom edge: the chapter index (one lit underline) and the one action. */}
      <div className="fr-bar">
        <nav className="fr-index" aria-label="Regions">
          {byNo.map((p) => {
            const on = p.id === plate?.id;
            return (
              <button key={p.id} className={`fr-idx${on ? ' is-on' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => select(on ? null : p.id)}>
                <span className="fr-idx-no fr-mono">{p.no}</span>
                <span className="fr-idx-name">{p.name}</span>
                <Shape status={p.status} size={12} />
                {on && <motion.span className="fr-idx-line" layoutId="fr-idx-line" transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }} />}
              </button>
            );
          })}
        </nav>
        <div className="fr-actions">
          {!plate ? (
            <button className={`fr-act ${overall === 'green' ? 'fr-act-quiet' : 'fr-act-primary'}`} onClick={() => step(1)}>
              <span className="fr-act-main">
                <b>Review {order[0]?.name}</b>
                <small>{STATUS_WORD[overall]}</small>
              </span>
              <Arrow dir="right" />
            </button>
          ) : shownStatus === 'green' ? (
            <button className="fr-act fr-act-quiet" onClick={() => step(1)}>
              <span className="fr-act-main">
                <b>Next</b>
                <small>{after?.name}</small>
              </span>
              <Arrow dir="right" />
            </button>
          ) : confirming ? (
            <>
              <button className="fr-act fr-act-quiet fr-act-narrow" onClick={() => setConfirming(false)}>
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
                    <b>{act.remeasure ? 'Requested' : 'Re-measure'}</b>
                    {act.remeasure && <small>Undo</small>}
                  </span>
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
                <button className="fr-act fr-act-second fr-act-narrow" onClick={() => setAct({ remeasure: false })}>
                  <span className="fr-act-main">
                    <b>Undo</b>
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
