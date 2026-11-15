// e^x design system: the only building blocks the four screens use.
// Pages are built with frame.tsx (checklist | gauges + object | bars). This file holds the words,
// the status shape and the one button system. Status is always shape + word (+ colour), never colour alone.
import type { ReactNode } from 'react';
import type { CrewMember, Status } from '../data/types';
import type { CW, MetricRow } from './model';

/* ------------------------------------------------------------------ status */

export const CW_STATUS: Record<CW, Status> = { nominal: 'green', advisory: 'green', caution: 'amber', warning: 'red', emergency: 'red' };

export function Shape({ s, size = 14 }: { s: Status; size?: number }) {
  return (
    <svg className={`ds-shape is-${s}`} width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      {s === 'green' && <circle cx="7" cy="7" r="5.5" />}
      {s === 'amber' && <path d="M7 1.2 13 12.5H1z" />}
      {s === 'red' && <rect x="1.5" y="1.5" width="11" height="11" />}
    </svg>
  );
}

/* ------------------------------------------------------------------ words */

/** The role in sentence case ("Flight engineer"), never an abbreviation. */
export const roleOf = (m: Pick<CrewMember, 'role'>) => m.role.charAt(0).toUpperCase() + m.role.slice(1).toLowerCase();

/** "Sleep is low for 4 days" */
export function plainLine(r: MetricRow): string {
  if (r.z == null) return `${r.label} is outside the safe range`;
  return `${r.label} is ${r.z >= 0 ? 'high' : 'low'}${r.running > 1 ? ` for ${r.running} days` : ' today'}`;
}

const dig = (r: MetricRow) => (r.k === 'sleep_h' || r.k === 'temp' ? 1 : r.k === 'dose_mSv_day' || r.k === 'bone_loss_pct' ? 2 : 0);
/** Lower-case the first letter only (keeps BP, CO2). */
export const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const unitOf = (r: MetricRow) => (r.unit === '1-5' ? '/ 5' : r.unit);
// sleep reads as hours:minutes (5:24), never a decimal (5.4)
const hmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const num = (r: MetricRow, v: number) => (r.k === 'sleep_h' ? hmm(v) : v.toFixed(dig(r)));
export const valOf = (r: MetricRow) => (r.value == null ? '—' : num(r, r.value));
export const usualOf = (r: MetricRow) => (r.lo == null || r.hi == null ? null : `${num(r, r.lo)}–${num(r, r.hi)}`);

type BtnKind = 'primary' | 'secondary' | 'danger' | 'quiet';
export function Btn({ kind = 'primary', onClick, children, disabled, label, wide }: { kind?: BtnKind; onClick?: () => void; children: ReactNode; disabled?: boolean; label?: string; wide?: boolean }) {
  return (
    <button type="button" className={`ds-btn is-${kind}${wide ? ' is-wide' : ''}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  );
}

