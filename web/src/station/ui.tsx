// Small shared pieces used by the design system and Tomas's replay: dot, trend chart with the personal baseline band, icons, sound cues.
import type { Status } from '../data/types';

export function Dot({ s, size = 10, pulse = false }: { s: Status; size?: number; pulse?: boolean }) {
  return <i className={`st-dot is-${s}${pulse && s !== 'green' ? ' is-pulse' : ''}`} style={{ width: size, height: size }} aria-hidden />;
}

export const STATUS_COLOR: Record<Status, string> = { green: '#7ee2ff', amber: '#ffbe5c', red: '#ff7062' };

/** Daily values with the personal baseline band (mean ± 2 sd), flags marked, today highlighted. */
export function TrendChart({
  points,
  lo,
  hi,
  mean,
  abs,
  height = 120,
  unit,
  digits = 0,
}: {
  points: { date: string; v: number | null; flag: Status | null }[];
  lo: number | null;
  hi: number | null;
  mean: number | null;
  abs?: { min: number; max: number };
  height?: number;
  unit: string;
  digits?: number;
}) {
  const W = 520;
  const H = height;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const vals = points.map((p) => p.v).filter((v): v is number => v != null);
  if (!vals.length) return <p className="st-muted">No readings yet.</p>;
  let min = Math.min(...vals, lo ?? Infinity);
  let max = Math.max(...vals, hi ?? -Infinity);
  const span = max - min || 1;
  min -= span * 0.15;
  max += span * 0.15;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  let d = '';
  points.forEach((p, i) => {
    if (p.v == null) return;
    d += `${d && points[i - 1]?.v != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  const last = points.length - 1;
  const ticks = [min + (max - min) * 0.2, min + (max - min) * 0.8];
  return (
    <svg className="st-trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend over the last four weeks">
      {lo != null && hi != null && (
        <>
          <rect x={pad.l} y={y(hi)} width={W - pad.l - pad.r} height={Math.max(1, y(lo) - y(hi))} className="st-band" />
          <text x={W - pad.r - 4} y={y(hi) - 4} textAnchor="end" className="st-axis">
            your usual range
          </text>
        </>
      )}
      {mean != null && <line x1={pad.l} x2={W - pad.r} y1={y(mean)} y2={y(mean)} className="st-mean" />}
      {abs && abs.max < max && <line x1={pad.l} x2={W - pad.r} y1={y(abs.max)} y2={y(abs.max)} className="st-abs" />}
      {abs && abs.min > min && <line x1={pad.l} x2={W - pad.r} y1={y(abs.min)} y2={y(abs.min)} className="st-abs" />}
      {ticks.map((t) => (
        <text key={t} x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="st-axis">
          {t.toFixed(digits)}
        </text>
      ))}
      <path d={d} className="st-line" />
      {points.map((p, i) =>
        p.v == null ? null : p.flag ? (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={i === last ? 5.5 : 3.6} fill={STATUS_COLOR[p.flag]} />
        ) : i === last ? (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={5.5} className="st-today" />
        ) : null,
      )}
      <text x={pad.l} y={H - 4} className="st-axis">
        {points[0]?.date.slice(5)}
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="st-axis">
        today
      </text>
      <title>{unit}</title>
    </svg>
  );
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  overview: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    </svg>
  ),
  crew: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M12 9v6m0 0-3 6m3-6 3 6M7 11.5l5-1.5 5 1.5" />
    </svg>
  ),
  checkin: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  radiation: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3a9 9 0 0 1 7.8 4.5L14 10.8M12 3a9 9 0 0 0-7.8 4.5L10 10.8M4.2 16.5A9 9 0 0 0 12 21v-6.6M19.8 16.5A9 9 0 0 1 12 21" />
    </svg>
  ),
  cabin: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M3 12h3l2-5 4 10 2-5h7" />
    </svg>
  ),
  play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  ),
  pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  arrow: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  ),
  phone: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  ),
  sound: ({ on }: { on: boolean }) => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16 9.5 5 5m0-5-5 5" />}
    </svg>
  ),
  star: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
    </svg>
  ),
  flame: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4 2.5-5 0 1.8.8 3 2 3.5-.6-3.3.3-6.5 1-9.5" />
    </svg>
  ),
};

/** Short sound cues, Web Audio only (no files). */
let ctx: AudioContext | null = null;
export function cue(kind: 'tick' | 'chime' | 'alarm' | 'arrive', on: boolean) {
  if (!on) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime + 0.01;
    const tone = (f: number, at: number, len: number, vol = 0.12, type: OscillatorType = 'sine') => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(ctx!.destination);
      o.start(at);
      o.stop(at + len + 0.02);
    };
    if (kind === 'tick') tone(1400, t0, 0.05, 0.04);
    if (kind === 'chime') [660, 880, 1320].forEach((f, i) => tone(f, t0 + i * 0.11, 0.5, 0.09));
    if (kind === 'alarm') for (let r = 0; r < 3; r++) [740, 988].forEach((f, i) => tone(f, t0 + r * 0.6 + i * 0.25, 0.22, 0.16, 'square'));
    if (kind === 'arrive') [220, 165].forEach((f, i) => tone(f, t0 + i * 0.3, 0.9, 0.14, 'sawtooth'));
  } catch {
    /* no audio device: visuals still carry it */
  }
}
