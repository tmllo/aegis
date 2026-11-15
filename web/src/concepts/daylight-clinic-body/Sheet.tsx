// Bottom sheet: one metric against the person's own baseline, and one action.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MetricKey, Status } from '../../data/types';

export function Shape({ status, size = 16 }: { status: Status; size?: number }) {
  const c = `var(--dc-${status === 'green' ? 'ok' : status === 'amber' ? 'warn' : 'crit'})`;
  return (
    <svg className="dcb-shape" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {status === 'green' && <circle cx="8" cy="8" r="5.25" fill="none" stroke="var(--dc-ink-2)" strokeWidth="1.5" />}
      {status === 'amber' && <path d="M8 1.5 15 14.5H1Z" fill={c} />}
      {status === 'red' && <rect x="2" y="2" width="12" height="12" fill={c} />}
    </svg>
  );
}

export interface Detail {
  id: string;
  metric: MetricKey;
  label: string;
  /** One-word name, for the escalation line. */
  short: string;
  regionName: string;
  status: Status;
  statusWord: string;
  value: number;
  unit: string;
  decimals: number;
  direction: string;
  delta: string;
  days: number;
  /** Personal band: mean and sd from the file. */
  band: { mean: number; sd: number; windowMean: number | null } | null;
  /** Absolute limits for metrics with no personal baseline. */
  limit: { amber: number; red: number } | null;
  trace: (number | null)[];
  explain: string;
  action: string | null;
  illustrative: boolean;
}

function useRoll(target: number, ms = 350): number {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current;
    prev.current = target;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (start === target || still) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const pct = (v: number, lo: number, hi: number): string => `${(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 100).toFixed(2)}%`;

/** Mean +/- 2 sd as a band, today's value as a dot, the 3-day mean as a ring. */
function Band({ d }: { d: Detail }) {
  const fmt = (v: number) => v.toFixed(d.decimals);
  if (d.band) {
    const { mean, sd, windowMean } = d.band;
    const lo = Math.min(mean - 4 * sd, d.value - sd, (windowMean ?? d.value) - sd);
    const hi = Math.max(mean + 4 * sd, d.value + sd, (windowMean ?? d.value) + sd);
    return (
      <div className="dcb-band" key={d.id}>
        <div className="dcb-band-track">
          <span className="dcb-band-fill" style={{ left: pct(mean - 2 * sd, lo, hi), right: `calc(100% - ${pct(mean + 2 * sd, lo, hi)})` }} />
          <span className="dcb-band-mean" style={{ left: pct(mean, lo, hi) }} />
          {windowMean !== null && <span className="dcb-band-ring" style={{ left: pct(windowMean, lo, hi) }} />}
          <span className="dcb-band-dot" data-status={d.status} style={{ left: pct(d.value, lo, hi) }} />
        </div>
        <div className="dcb-band-scale">
          <span style={{ left: pct(mean - 2 * sd, lo, hi) }}>{fmt(mean - 2 * sd)}</span>
          <span style={{ left: pct(mean + 2 * sd, lo, hi) }}>{fmt(mean + 2 * sd)}</span>
        </div>
      </div>
    );
  }
  if (!d.limit) return null;
  const hi = d.limit.red * 1.08;
  return (
    <div className="dcb-band" key={d.id}>
      <div className="dcb-band-track">
        <span className="dcb-band-fill" style={{ left: 0, right: `calc(100% - ${pct(d.limit.amber, 0, hi)})` }} />
        <span className="dcb-band-mean" style={{ left: pct(d.limit.red, 0, hi) }} />
        <span className="dcb-band-dot" data-status={d.status} style={{ left: pct(d.value, 0, hi) }} />
      </div>
      <div className="dcb-band-scale">
        <span style={{ left: pct(d.limit.amber, 0, hi) }}>{fmt(d.limit.amber)}</span>
        <span style={{ left: pct(d.limit.red, 0, hi) }}>{fmt(d.limit.red)}</span>
      </div>
    </div>
  );
}

function Trace({ d }: { d: Detail }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 76;
  const padX = 8;
  const padY = 10;
  const vals = d.trace.filter((v): v is number => v != null);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (d.band) {
    lo = Math.min(lo, d.band.mean - 2.4 * d.band.sd);
    hi = Math.max(hi, d.band.mean + 2.4 * d.band.sd);
  }
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const n = d.trace.length;
  const x = (i: number) => padX + (n > 1 ? (i / (n - 1)) * (w - padX * 2) : 0);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (h - padY * 2);
  let path = '';
  let pen = false;
  d.trace.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  const last = d.trace[n - 1];
  return (
    <div className="dcb-trace" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`${d.label}, last ${n} days`}>
          {d.band && (
            <rect
              x={0}
              width={w}
              y={y(d.band.mean + 2 * d.band.sd)}
              height={y(d.band.mean - 2 * d.band.sd) - y(d.band.mean + 2 * d.band.sd)}
              className="dcb-trace-band"
            />
          )}
          {d.band && <line x1={0} x2={w} y1={y(d.band.mean)} y2={y(d.band.mean)} className="dcb-trace-mean" />}
          {d.limit && d.limit.amber <= hi && d.limit.amber >= lo && (
            <line x1={0} x2={w} y1={y(d.limit.amber)} y2={y(d.limit.amber)} className="dcb-trace-mean" />
          )}
          <path d={path} className="dcb-trace-line" />
          {last != null && <circle cx={x(n - 1)} cy={y(last)} r={5} className="dcb-trace-last" data-status={d.status} />}
        </svg>
      )}
      <div className="dcb-trace-axis">
        <span>{n} days</span>
        <span>Today</span>
      </div>
    </div>
  );
}

const HOLD_MS = 1200;
const CANCEL_S = 5;

/** Press and hold: a glove resting on the glass never escalates by accident. */
function HoldButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number>();
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="dcb-hold"
      data-holding={holding}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
      onKeyUp={stop}
    >
      <span className="dcb-hold-fill" />
      <span className="dcb-hold-label">{label}</span>
    </button>
  );
}

/** Red: escalation is the primary. After the hold there is a short window to cancel. */
function RedActions({ d }: { d: Detail }) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'sent'>('idle');
  const [left, setLeft] = useState(CANCEL_S);
  const [remeasured, setRemeasured] = useState(false);
  useEffect(() => {
    if (phase !== 'pending') return;
    if (left <= 0) {
      setPhase('sent');
      return;
    }
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, left]);
  const what = `${d.short} ${d.value.toFixed(d.decimals)}${d.unit.startsWith('/') ? '' : ' '}${d.unit}`;
  return (
    <div className="dcb-act" data-kind="red">
      {phase === 'idle' && (
        <HoldButton
          label="Hold to escalate"
          onConfirm={() => {
            setLeft(CANCEL_S);
            setPhase('pending');
          }}
        />
      )}
      {phase !== 'idle' && (
        <p className="dcb-sent" data-phase={phase} role="status">
          <span className="dcb-sent-word">{phase === 'pending' ? `Sending in ${left} s` : 'Sent'}</span>
          <span className="dcb-mono">Flight surgeon report · {what}</span>
        </p>
      )}
      {phase === 'pending' ? (
        <button type="button" className="dcb-second" onClick={() => setPhase('idle')}>
          Cancel
        </button>
      ) : (
        <button type="button" className="dcb-second" data-done={remeasured} onClick={() => setRemeasured(true)}>
          {remeasured ? 'Re-measure logged' : 'Re-measure'}
        </button>
      )}
    </div>
  );
}

/** Amber: re-measure first, then the confirmed value is flagged for the next conference. */
function AmberActions() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  return (
    <div className="dcb-act" data-kind="amber">
      <button type="button" className="dcb-step" data-state={step === 0 ? 'now' : 'done'} onClick={() => step === 0 && setStep(1)}>
        <span className="dcb-step-n">1</span>
        {step === 0 ? 'Re-measure' : 'Re-measured'}
      </button>
      <button
        type="button"
        className="dcb-step"
        data-state={step === 0 ? 'wait' : step === 1 ? 'now' : 'done'}
        disabled={step === 0}
        onClick={() => step === 1 && setStep(2)}
      >
        <span className="dcb-step-n">2</span>
        {step === 2 ? 'Flagged for conference' : 'Flag for conference'}
      </button>
    </div>
  );
}

function Actions({ d }: { d: Detail }) {
  if (d.status === 'red') return <RedActions d={d} />;
  if (d.status === 'amber') return <AmberActions />;
  return (
    <div className="dcb-act" data-kind="green">
      <p className="dcb-quiet">
        <Shape status="green" size={18} />
        <span>No action</span>
      </p>
    </div>
  );
}

function Square({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="dcb-sq" aria-label={label} onClick={onClick}>
      {children}
      <span className="dcb-sq-label">{label}</span>
    </button>
  );
}

interface Props {
  detail: Detail | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  sourceHref: string | null;
}

export function Sheet({ detail, onClose, onPrev, onNext, sourceHref }: Props) {
  // Keep the last content while the sheet slides away.
  const last = useRef<Detail | null>(null);
  if (detail) last.current = detail;
  const d = detail ?? last.current;
  const rolled = useRoll(d?.value ?? 0);

  return (
    <section className="dcb-sheet" data-open={detail !== null} aria-hidden={detail === null} aria-label="Metric detail">
      {d && (
        <>
          <div className="dcb-sheet-body">
            <div className="dcb-col-a">
              <p className="dcb-status-row">
                <Shape status={d.status} size={22} />
                <span className="dcb-status-word">{d.statusWord}</span>
                <span className="dcb-mono">{d.regionName}</span>
              </p>
              <p className="dcb-metric-label">{d.label}</p>
              <div className="dcb-hero-row">
                <p className="dcb-hero">
                  {rolled.toFixed(d.decimals)}
                  <span className="dcb-unit">{d.unit}</span>
                </p>
                <dl className="dcb-facts">
                  <div>
                    <dt className="dcb-mono">{d.band ? 'Own band' : 'Limit'}</dt>
                    <dd>
                      {d.direction}
                      {d.delta && <span className="dcb-fact-sub">{d.delta}</span>}
                    </dd>
                  </div>
                  {d.days > 0 && (
                    <div>
                      <dt className="dcb-mono">Running</dt>
                      <dd>
                        {d.days}
                        <span className="dcb-fact-sub">{d.days === 1 ? 'day' : 'days'}</span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div className="dcb-col-b">
              <p className="dcb-mono dcb-chart-head">
                <span>{d.band ? 'Own baseline' : 'Limit'}</span>
                <span className="dcb-legend">
                  <i className="dcb-key-dot" /> Today
                  {d.band && (
                    <>
                      <i className="dcb-key-ring" /> 3-day mean
                    </>
                  )}
                </span>
              </p>
              <Band d={d} />
              <Trace d={d} />
            </div>

            <div className="dcb-col-c">
              <p className="dcb-explain">{d.explain}</p>
              {d.action && (
                <>
                  <p className="dcb-mono">Action</p>
                  <p className="dcb-action-text">{d.action}</p>
                </>
              )}
              {d.illustrative && <p className="dcb-mono dcb-ill">Placement illustrative</p>}
            </div>
          </div>

          <div className="dcb-actions">
            <Actions key={d.id} d={d} />
            <div className="dcb-nav">
              {sourceHref && (
                <a className="dcb-sq" href={sourceHref} aria-label="Source: where this value comes from">
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                    <path d="M4 5h5v5H4zM13 12h5v5h-5zM9 7.5h4.5V12" />
                  </svg>
                  <span className="dcb-sq-label">Source</span>
                </a>
              )}
              <Square label="Prev" onClick={onPrev}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M4 14 11 7l7 7" />
                </svg>
              </Square>
              <Square label="Next" onClick={onNext}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M4 8l7 7 7-7" />
                </svg>
              </Square>
              <Square label="Close" onClick={onClose}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M4 4 18 18M18 4 4 18" />
                </svg>
              </Square>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
