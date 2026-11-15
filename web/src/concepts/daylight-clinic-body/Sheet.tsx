// Bottom sheet: one metric against the person's own baseline, and one action.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MetricKey, Status } from '../../data/types';

export function Shape({ status, size = 16 }: { status: Status; size?: number }) {
  const c = `var(--dc-${status === 'green' ? 'ok' : status === 'amber' ? 'warn' : 'crit'})`;
  return (
    <svg className="dcb-shape" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {status === 'green' && <circle cx="8" cy="8" r="6" fill={c} />}
      {status === 'amber' && <path d="M8 1.5 15 14.5H1Z" fill={c} />}
      {status === 'red' && <rect x="2" y="2" width="12" height="12" fill={c} />}
    </svg>
  );
}

export interface Detail {
  id: string;
  metric: MetricKey;
  label: string;
  regionName: string;
  status: Status;
  statusWord: string;
  value: number;
  unit: string;
  decimals: number;
  direction: string;
  delta: string;
  days: number;
  /** true when the reading can be taken again on the spot. */
  remeasure: boolean;
  /** Personal band: mean and sd from the file. */
  band: { mean: number; sd: number; windowMean: number | null } | null;
  /** Absolute limits for metrics with no personal baseline. */
  limit: { amber: number; red: number } | null;
  trace: (number | null)[];
  explain: string;
  action: string | null;
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
        <span style={{ left: pct(d.limit.amber, 0, hi) }}>Watch {fmt(d.limit.amber)}</span>
        <span style={{ left: pct(d.limit.red, 0, hi) }}>Limit {fmt(d.limit.red)}</span>
      </div>
    </div>
  );
}

function Trace({ d }: { d: Detail }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 84;
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

interface Step {
  label: string;
  /** Line shown once the step is done. */
  log: string;
  tone: 'ink' | 'line' | 'crit';
  /** Needs a second tap before it is sent. */
  confirm?: boolean;
}

/** The one next step for this state. Red escalates at once; amber ends in the conference flag. */
function stepsFor(d: Detail): Step[] {
  if (d.status === 'red') return [{ label: 'Escalate', log: 'Escalated to crew medical officer', tone: 'crit', confirm: true }];
  const again: Step = { label: 'Re-measure', log: 'Re-measure logged', tone: d.status === 'amber' ? 'ink' : 'line' };
  if (d.status === 'green') return d.remeasure ? [again] : [];
  const flag: Step = { label: 'Flag for conference', log: 'Flagged for conference', tone: d.remeasure ? 'line' : 'ink' };
  return d.remeasure ? [again, flag] : [flag];
}

const clock = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const ARM_MS = 5000;

function Actions({ d }: { d: Detail }) {
  const steps = stepsFor(d);
  const [times, setTimes] = useState<string[]>([]);
  const [armed, setArmed] = useState(false);
  const done = times.length;
  const step = steps[done];
  const lastStep = steps[done - 1];

  // An unconfirmed escalation stands down by itself.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), ARM_MS);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (!steps.length) return null;
  const press = () => {
    if (!step) return;
    if (step.confirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setTimes((t) => [...t, clock()]);
  };
  const back = () => {
    if (armed) setArmed(false);
    else setTimes((t) => t.slice(0, -1));
  };

  return (
    <div className="dcb-actions">
      <p className="dcb-log" role="status">
        {armed ? (
          'Tap again to send'
        ) : lastStep ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8.5 6.5 12.5 13.5 4" />
            </svg>
            {lastStep.log}
            <span className="dcb-log-time">{times[done - 1]}</span>
          </>
        ) : null}
      </p>
      <div className="dcb-action-row">
        <button type="button" className="dcb-primary" data-tone={step ? step.tone : 'done'} data-armed={armed} disabled={!step} onClick={press}>
          {armed && <span className="dcb-arm" />}
          <span className="dcb-primary-label">{step ? (armed ? 'Confirm escalate' : step.label) : lastStep.log.split(' ')[0]}</span>
        </button>
        {(done > 0 || armed) && (
          <button type="button" className="dcb-undo" onClick={back}>
            {armed ? 'Cancel' : 'Undo'}
          </button>
        )}
      </div>
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
  /** The data system map, opened on this metric. */
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
        <div className="dcb-sheet-body">
          <div className="dcb-col-a">
            <p className="dcb-status-row">
              <Shape status={d.status} size={22} />
              <span className="dcb-status-word">{d.statusWord}</span>
              <span className="dcb-mono">{d.regionName}</span>
            </p>
            <p className="dcb-metric-label">{d.label}</p>
            <p className="dcb-hero">
              {rolled.toFixed(d.decimals)}
              <span className="dcb-unit">{d.unit}</span>
            </p>
            {d.status !== 'green' && (
              <dl className="dcb-facts">
                <div>
                  <dt>Direction</dt>
                  <dd>
                    {d.direction}
                    {d.delta && <span className="dcb-fact-sub">{d.delta}</span>}
                  </dd>
                </div>
                <div>
                  <dt>Running</dt>
                  <dd>
                    {d.days}
                    <span className="dcb-fact-sub">{d.days === 1 ? 'day' : 'days'}</span>
                  </dd>
                </div>
              </dl>
            )}
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
            <p className="dcb-mono">Action</p>
            <p className="dcb-action-text">{d.action ?? 'None needed.'}</p>
            <Actions key={d.id} d={d} />
          </div>

          <div className="dcb-col-d">
            <Square label="Close" onClick={onClose}>
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                <path d="M4 4 18 18M18 4 4 18" />
              </svg>
            </Square>
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
            {sourceHref && (
              <a className="dcb-sq" href={sourceHref} aria-label="Data path">
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <path d="M4 5h5v5H4zM13 12h5v5h-5zM9 7.5h4.5V12" />
                </svg>
                <span className="dcb-sq-label">Path</span>
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
