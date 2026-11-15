// Small shared pieces for the suit concepts. Styling comes from each concept's CSS
// through class names and currentColor.
import { DISCLAIMERS } from '../../components/Footer';
import type { Status } from '../../data/types';
import { bandScale, fmt, STATUS_WORD, type Reading, type SuitData } from './suitData';

export const STATUS_VAR: Record<Status, string> = {
  green: 'rgb(var(--ok))',
  amber: 'rgb(var(--warn))',
  red: 'rgb(var(--crit))',
};

/** Status by shape + colour (+ the word next to it): circle, triangle, square. */
export function StatusMark({ status, size = 14 }: { status: Status | null; size?: number }) {
  const c = status ? STATUS_VAR[status] : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {status === 'green' && <circle cx="7" cy="7" r="6" fill={c} />}
      {status === 'amber' && <path d="M7 1 L13.2 12.6 H0.8 Z" fill={c} />}
      {status === 'red' && <rect x="1" y="1" width="12" height="12" fill={c} />}
      {status == null && <circle cx="7" cy="7" r="5.5" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="2 2" />}
    </svg>
  );
}

export const statusWord = (s: Status | null) => (s ? STATUS_WORD[s] : 'No feed');

/** Value against her own band (mean +/- 2 sd) or the cabin limit band. */
export function BaselineBar({ r, className = '' }: { r: Reading; className?: string }) {
  const b = bandScale(r);
  if (!b) return null;
  const col = r.status ? STATUS_VAR[r.status] : 'currentColor';
  return (
    <svg viewBox="0 0 300 36" className={`w-full ${className}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" x2="300" y1="18" y2="18" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
      <rect x={b.lo * 300} width={Math.max(2, (b.hi - b.lo) * 300)} y="12" height="12" fill="currentColor" fillOpacity="0.16" rx="2" />
      {b.mean != null && <line x1={b.mean * 300} x2={b.mean * 300} y1="8" y2="28" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />}
      <circle cx={b.v * 300} cy="18" r="7" fill={col} />
    </svg>
  );
}

/** Last 14 days with the band behind. */
export function Spark({ r, className = '' }: { r: Reading; className?: string }) {
  const vals = r.history.filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals, r.lo ?? Infinity);
  const hi = Math.max(...vals, r.hi ?? -Infinity);
  const W = 300;
  const H = 64;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const n = r.history.length;
  const pts = r.history
    .map((v, i) => (v == null ? null : `${(i / (n - 1)) * W},${y(v)}`))
    .filter(Boolean)
    .join(' ');
  const last = r.history[n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} preserveAspectRatio="none" aria-hidden>
      {r.lo != null && r.hi != null && (
        <rect x="0" width={W} y={y(r.hi)} height={Math.max(1, y(r.lo) - y(r.hi))} fill="currentColor" fillOpacity="0.1" />
      )}
      <polyline points={pts} fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {last != null && <circle cx={W} cy={y(last)} r="4" fill={r.status ? STATUS_VAR[r.status] : 'currentColor'} />}
    </svg>
  );
}

/** "+2.5 sd vs her baseline" style line, from core/scoring z. */
export function deltaText(r: Reading): string {
  if (r.basis === 'limit') {
    if (r.value == null) return 'No feed';
    return r.limitSource ? `${r.limitSource} limit` : 'Cabin limit';
  }
  if (r.mean == null || r.value == null) return '';
  const d = r.value - r.mean;
  return `${d >= 0 ? '+' : '-'}${fmt(Math.abs(d), r.digits)} vs usual ${fmt(r.mean, r.digits)}`;
}

export const SUIT_CREDITS = [
  'Body: MakeHuman / MPFB, CC0',
  'Earth: NASA Blue Marble and Black Marble, public domain',
  'Clouds: Solar System Scope, CC BY 4.0',
] as const;

/** Every disclaimer + data credit + asset credits. */
export function Credits({ s, className = '' }: { s: SuitData | null; className?: string }) {
  const lines: string[] = [...DISCLAIMERS];
  if (s?.stormCredit) lines.push(`Space weather data: ${s.stormCredit}`);
  return (
    <footer className={className}>
      <p>{lines.join('  ·  ')}</p>
      <p>{SUIT_CREDITS.join('  ·  ')}</p>
    </footer>
  );
}

/** Status colour as a literal for three.js, read from the CSS tokens. */
export function statusRGB(st: Status): string {
  const name = st === 'green' ? '--ok' : st === 'amber' ? '--warn' : '--crit';
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v.split(/\s+/).join(',')})` : '#ffffff';
}
