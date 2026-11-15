// Console building blocks: status mark, panel, tables, arc gauge with ticks, band, trend with
// crosshair, ticking numbers, procedure confirm, icons.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Status } from '../data/types';
import { fmt, STATUS_WORD } from './model';

export const S_VAR: Record<Status, string> = { green: 'rgb(var(--ok))', amber: 'rgb(var(--warn))', red: 'rgb(var(--crit))' };
export const statusWord = (s: Status | null) => (s ? STATUS_WORD[s] : 'No feed');
const FADE = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that ticks to its new value in 200 ms (tabular figures). */
export function useTick(value: number | null, digits: number): string {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value == null || from.current == null || reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 200);
      setShown(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return fmt(shown, digits);
}

export function Num({ v, d, unit }: { v: number | null; d: number; unit?: string }) {
  const s = useTick(v, d);
  return (
    <>
      {s}
      {unit && v != null && <small>{unit}</small>}
    </>
  );
}

/** Status by shape: circle, triangle, square; dashed ring = no feed. */
export function Mark({ s, size = 12 }: { s: Status | null; size?: number }) {
  const c = s ? S_VAR[s] : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="mk">
      {s === 'green' && <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.6" />}
      {s === 'amber' && <path d="M7 1.4 L12.8 12.2 H1.2 Z" fill={c} />}
      {s === 'red' && <rect x="1.8" y="1.8" width="10.4" height="10.4" fill={c} />}
      {s == null && <circle cx="7" cy="7" r="4.5" fill="none" stroke={c} strokeWidth="1.2" strokeDasharray="2 2" />}
    </svg>
  );
}

/** A framed panel: small leading icon, caps label, optional readout on the right. */
export function Panel({ label, icon, aside, className = '', children }: { label: string; icon?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`px-panel ${className}`}>
      <header className="px-head">
        <span className="px-label">
          {icon && <Icon name={icon} size={14} />}
          {label}
        </span>
        {aside != null && <span className="px-aside">{aside}</span>}
      </header>
      <div className="px-body">{children}</div>
    </section>
  );
}

/** Label left, value right (caps), like a procedure table. */
export function KV({ k, v, status }: { k: string; v: ReactNode; status?: Status | null }) {
  return (
    <div className="kv" data-status={status ?? undefined}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export interface GaugeValue {
  value: number | null;
  digits: number;
  unit: string;
  status: Status | null;
  lo: number | null;
  hi: number | null;
  mean?: number | null;
}

/** 270 degree arc with precise ticks; band as a thin segment, value as a needle. */
export function Arc({ g, size = 170, label }: { g: GaugeValue; size?: number; label?: string }) {
  const R = 76;
  const pt = (f: number, r = R) => {
    const a = ((135 + 270 * f) * Math.PI) / 180;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0);
    const [x1, y1] = pt(f1);
    return `M${x0} ${y0} A${R} ${R} 0 ${270 * (f1 - f0) > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  let band: [number, number] | null = null;
  let v: number | null = null;
  if (g.value != null) {
    const lo = g.lo ?? g.value;
    const hi = g.hi ?? g.value;
    const span = Math.max(hi - lo, Math.abs(g.value) * 0.1, 1e-6);
    const min = Math.min(lo, g.value) - span * 0.6;
    const max = Math.max(hi, g.value) + span * 0.6;
    const p = (x: number) => Math.max(0, Math.min(1, (x - min) / (max - min)));
    if (g.lo != null || g.hi != null) band = [p(lo), p(hi)];
    v = p(g.value);
  }
  const col = !g.status || g.status === 'green' ? 'rgb(var(--accent))' : S_VAR[g.status];
  const txt = useTick(g.value, g.digits);
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="arc">
      {Array.from({ length: 55 }, (_, i) => {
        const f = i / 54;
        const major = i % 9 === 0;
        const [x0, y0] = pt(f, R + 8);
        const [x1, y1] = pt(f, R + (major ? 17 : 12));
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgb(var(--ink))" strokeOpacity={major ? 0.5 : 0.18} strokeWidth="1" />;
      })}
      <path d={arc(0, 1)} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.1" strokeWidth="1.5" />
      {band && <path d={arc(band[0], band[1])} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.22" strokeWidth="5" />}
      {v != null && <path d={arc(0, Math.max(0.002, v))} fill="none" stroke={col} strokeWidth="2" />}
      {v != null && <line x1={pt(v, R - 10)[0]} y1={pt(v, R - 10)[1]} x2={pt(v, R + 17)[0]} y2={pt(v, R + 17)[1]} stroke={col} strokeWidth="2" />}
      <text x="100" y="104" textAnchor="middle" className="arc-v">
        {txt}
      </text>
      <text x="100" y="128" textAnchor="middle" className="arc-u">
        {g.value != null ? g.unit : ''}
      </text>
      {label && (
        <text x="100" y="176" textAnchor="middle" className="arc-l">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Value against its band as one hairline with end ticks. */
export function Band({ g }: { g: GaugeValue }) {
  if (g.value == null || (g.lo == null && g.hi == null)) return null;
  const lo = g.lo ?? g.value;
  const hi = g.hi ?? g.value;
  const span = Math.max(hi - lo, Math.abs(g.value) * 0.05, 1e-6);
  const min = Math.min(lo, g.value) - span * 0.5;
  const max = Math.max(hi, g.value) + span * 0.5;
  const p = (x: number) => ((x - min) / (max - min)) * 300;
  return (
    <svg viewBox="0 0 300 24" className="band" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 31 }, (_, i) => (
        <line key={i} x1={i * 10} x2={i * 10} y1="20" y2={i % 5 ? 23 : 24} stroke="rgb(var(--ink))" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
      ))}
      <line x1="0" x2="300" y1="12" y2="12" stroke="rgb(var(--ink))" strokeOpacity="0.18" vectorEffect="non-scaling-stroke" />
      <rect x={p(lo)} width={Math.max(1, p(hi) - p(lo))} y="9" height="6" fill="rgb(var(--ink))" fillOpacity="0.14" />
      {g.mean != null && <line x1={p(g.mean)} x2={p(g.mean)} y1="4" y2="20" stroke="rgb(var(--ink))" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />}
      <rect x={p(g.value) - 1.5} y="2" width="3" height="18" fill={!g.status || g.status === 'green' ? 'rgb(var(--accent))' : S_VAR[g.status]} />
    </svg>
  );
}

/** Large trend: band, flag markers, date ticks and a crosshair readout under the pointer. */
export function Chart({ values, dates, flagged = [], g, height = 260 }: { values: (number | null)[]; dates: string[]; flagged?: boolean[]; g: GaugeValue; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const vals = values.filter((v): v is number => v != null);
  if (vals.length < 2) return <p className="note">No history</p>;
  const lo = Math.min(...vals, g.lo ?? Infinity);
  const hi = Math.max(...vals, g.hi ?? -Infinity);
  const pad = (hi - lo || 1) * 0.12;
  const W = 800;
  const H = height;
  const n = values.length;
  const x = (i: number) => 40 + (i / (n - 1)) * (W - 56);
  const y = (v: number) => 14 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 44);
  const pts = values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const fx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((fx - 40) / (W - 56)) * (n - 1)))));
  };
  const hv = hover != null ? values[hover] : null;
  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" onPointerMove={move} onPointerLeave={() => setHover(null)} aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = lo - pad + (hi - lo + 2 * pad) * (1 - f);
          const yy = 14 + f * (H - 44);
          return (
            <g key={f}>
              <line x1="40" x2={W - 16} y1={yy} y2={yy} stroke="rgb(var(--ink))" strokeOpacity="0.07" />
              <text x="34" y={yy + 4} textAnchor="end" className="chart-t">
                {v.toFixed(g.digits)}
              </text>
            </g>
          );
        })}
        {g.lo != null && g.hi != null && <rect x="40" width={W - 56} y={y(g.hi)} height={Math.max(1, y(g.lo) - y(g.hi))} fill="rgb(var(--ink))" fillOpacity="0.06" />}
        {g.mean != null && <line x1="40" x2={W - 16} y1={y(g.mean)} y2={y(g.mean)} stroke="rgb(var(--ink))" strokeOpacity="0.3" strokeDasharray="3 4" />}
        {dates.map((d, i) =>
          i % 5 === 0 || i === n - 1 ? (
            <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="chart-t">
              {d.slice(5)}
            </text>
          ) : null,
        )}
        <polyline points={pts} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" />
        {values.map((v, i) =>
          v != null && flagged[i] ? <rect key={i} x={x(i) - 3.5} y={y(v) - 3.5} width="7" height="7" fill={S_VAR[g.status && g.status !== 'green' ? g.status : 'amber']} /> : null,
        )}
        {hover != null && hv != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1="10" y2={H - 26} stroke="rgb(var(--ink))" strokeOpacity="0.5" />
            <line x1="40" x2={W - 16} y1={y(hv)} y2={y(hv)} stroke="rgb(var(--ink))" strokeOpacity="0.25" />
            <circle cx={x(hover)} cy={y(hv)} r="4" fill="rgb(var(--ink))" />
          </g>
        )}
      </svg>
      <div className="chart-read">
        {hover != null ? (
          <>
            <span>{dates[hover]}</span>
            <b>
              {fmt(hv, g.digits)} {g.unit}
            </b>
            {flagged[hover] && <span className="chart-flag">Flag</span>}
          </>
        ) : (
          <span>Point at the line</span>
        )}
      </div>
    </div>
  );
}

/** Procedure confirm: number + title, tag, bold status line, one sentence, one square button. */
export function Confirm({
  open,
  code,
  title,
  tag,
  status,
  body,
  go = 'Done',
  danger,
  onDone,
  onCancel,
}: {
  open: boolean;
  code: string;
  title: string;
  tag: string;
  status: string;
  body: string;
  go?: string;
  danger?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onCancel]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cf-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} onClick={onCancel}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} className="cf-box" data-danger={danger || undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} onClick={(e) => e.stopPropagation()}>
            <h3>
              <span>{code}</span>
              {title}
            </h3>
            <p className="cf-tag">{tag}</p>
            <p className="cf-status">{status}</p>
            {body && <p className="cf-body">{body}</p>}
            <button type="button" className="cf-go" onClick={onDone} autoFocus>
              {go}
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

const ICON_PATHS: Record<string, ReactNode> = {
  crew: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6" />,
  vitals: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  cabin: <path d="M4 9h11a3 3 0 1 0-3-3M4 15h14a3 3 0 1 1-3 3M4 12h8" />,
  storm: <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
  systems: <path d="M3 12h3M18 12h3M9 12h6M6 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M15 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0" />,
  mind: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  checkin: <path d="M5 12.5l4 4 10-10" />,
  measure: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  ground: <path d="M4 18a12 12 0 0 1 16 0M7.5 14.5a7 7 0 0 1 9 0M11 11h2M12 21v-1" />,
  back: <path d="M15 5l-7 7 7 7" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  alert: <path d="M12 4 2.5 20h19L12 4ZM12 10v4M12 17h.01" />,
  globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />,
  chart: <path d="M3 20h18M5 16l4-5 4 3 6-8" />,
  dial: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 12l4-4" />,
  note: <path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5" />,
  flow: <path d="M4 12h16M15 7l5 5-5 5" />,
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Rotate dial: tap left or right to turn the hero 20 degrees (no idle motion). */
export function RotateDial({ deg, onChange, style }: { deg: number; onChange: (d: number) => void; style?: React.CSSProperties }) {
  return (
    <div className="dial-ctl" style={{ ...style, ['--rot' as string]: `${deg}deg` }}>
      <span>Rotate</span>
      <button type="button" aria-label="Rotate left" style={{ left: -28, top: 47 }} onClick={() => onChange(deg - 20)}>
        <Icon name="back" size={18} />
      </button>
      <button type="button" aria-label="Rotate right" style={{ right: -28, top: 47, transform: 'scaleX(-1)' }} onClick={() => onChange(deg + 20)}>
        <Icon name="back" size={18} />
      </button>
    </div>
  );
}
