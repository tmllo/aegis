// e^x instrument frame: every page is the same panel.
//   title (centre top) · checklist (left) · object (centre) · vital cards and bars (right)
//   footer: page controls (left) · icon dock (centre) · main action (right)
// Status is always shape + word + colour.
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { Status } from '../data/types';
import { Shape } from './ds';

/* ------------------------------------------------------------------ page */

export function Page({ title, sub, left, object, right, footLeft, footRight, className = '' }: { title: ReactNode; sub?: ReactNode; left?: ReactNode; object?: ReactNode; right?: ReactNode; footLeft?: ReactNode; footRight?: ReactNode; className?: string }) {
  return (
    <div className={`fr ${className}`}>
      <header className="fr-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </header>
      <aside className="fr-left">{left}</aside>
      <div className="fr-centre">
        <div className="fr-object">{object}</div>
      </div>
      <aside className="fr-right">{right}</aside>
      <div className="fr-foot-l">{footLeft}</div>
      <div className="fr-foot-r">{footRight}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ checklist */

export function Check({ s, title, word, onClick, on, mark }: { s: Status; title: ReactNode; word: ReactNode; onClick?: () => void; on?: boolean; mark?: ReactNode }) {
  const body = (
    <>
      <span className={`fr-check-mark is-${mark != null ? 'plain' : s}`} aria-hidden>
        {mark ?? <Shape s={s} size={12} />}
      </span>
      <span className="fr-check-t">
        <b>{title}</b>
        <span>{word}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`fr-check is-${s}${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {body}
    </button>
  ) : (
    <div className={`fr-check is-${s}`}>{body}</div>
  );
}

/* ------------------------------------------------------------------ bar */

export function Bar({ label, value, frac, s = 'green', note }: { label: ReactNode; value: ReactNode; frac: number; s?: Status; note?: ReactNode }) {
  return (
    <div className={`fr-bar is-${s}`}>
      <span className="fr-bar-l">{label}</span>
      <b className="fr-bar-v">{value}</b>
      <span className="fr-bar-track">
        <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, frac))})` }} />
      </span>
      {note && <span className="fr-bar-n">{note}</span>}
    </div>
  );
}

export function SideCap({ children }: { children: ReactNode }) {
  return <p className="fr-cap">{children}</p>;
}

/* ------------------------------------------------------------------ dock */

const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const DOCK_ICON = {
  crew: (
    <svg viewBox="0 0 24 24" {...I}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3.5 19c.6-3.4 2.9-5 5.5-5s4.9 1.6 5.5 5M15 14.3c2.6-.4 4.8 1 5.4 4.2" />
    </svg>
  ),
  body: (
    <svg viewBox="0 0 24 24" {...I}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M6 9h12M12 8v6m0 0-3 7m3-7 3 7" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" {...I}>
      <rect x="5" y="4" width="14" height="17" />
      <path d="M9 4V2.8h6V4M8.5 12.5l2.3 2.3 4.7-4.8" />
    </svg>
  ),
  care: (
    <svg viewBox="0 0 24 24" {...I}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      <path d="M12 9.5v5M9.5 12h5" />
    </svg>
  ),
  surgeon: (
    <svg viewBox="0 0 24 24" {...I}>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <rect x="3" y="13" width="4" height="6" />
      <rect x="17" y="13" width="4" height="6" />
      <path d="M19 19c0 1.6-2 2.5-5 2.5" />
    </svg>
  ),
  mind: (
    <svg viewBox="0 0 24 24" {...I}>
      <path d="M9 20v-3.2A6.5 6.5 0 1 1 18.5 11l1.5 3h-2v2.5a1.5 1.5 0 0 1-1.5 1.5H14v2" />
    </svg>
  ),
  cabin: (
    <svg viewBox="0 0 24 24" {...I}>
      <path d="M4 9h11a3 3 0 1 0-3-3M4 15h14a3 3 0 1 1-3 3M4 12h8" />
    </svg>
  ),
  environment: (
    <svg viewBox="0 0 24 24" {...I}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </svg>
  ),
};

export function Dock({ items }: { items: { to: string; label: string; icon: keyof typeof DOCK_ICON; alert?: Status; end?: boolean }[] }) {
  return (
    <nav className="fr-dock" aria-label="Pages">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'is-on' : '')}>
          <span className="fr-dock-i">
            {DOCK_ICON[n.icon]}
            {n.alert && n.alert !== 'green' && <Shape s={n.alert} size={8} />}
          </span>
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ vital card (after Fuselab's health monitor) */

const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const VITAL_ICON = {
  heart: <path {...G} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  pressure: <path {...G} d="M12 3.5s6 6.6 6 10.5a6 6 0 0 1-12 0c0-3.9 6-10.5 6-10.5Z" />,
  sleep: <path {...G} d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  sugar: <path {...G} d="M7 9h10v10H7zM9.5 5h5v4h-5z" />,
  temp: <path {...G} d="M10 4.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z" />,
  mood: (
    <g {...G}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.8 14.2c1.6 1.8 4.8 1.8 6.4 0" />
    </g>
  ),
  run: <path {...G} d="M13 5.5a1.5 1.5 0 1 0 0-.01M10 20l2.5-5.5L15 16v4M8 11l3-3 3 2 2.5 1.5M12.5 14.5 11 9" />,
  bone: <path {...G} d="M8 6a2 2 0 1 0-2 3l9 9a2 2 0 1 0 3-2 2 2 0 1 0-2-3L7 4a2 2 0 1 0 1 2Z" />,
  dose: (
    <g {...G}>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M12 3.5a8.5 8.5 0 0 1 7.4 4.3l-4.9 2.8M4.6 7.8A8.5 8.5 0 0 1 12 3.5M4.6 7.8l4.9 2.8M12 20.5a8.5 8.5 0 0 0 7.4-4.3l-4.9-2.8M12 20.5a8.5 8.5 0 0 1-7.4-4.3l4.9-2.8" />
    </g>
  ),
  air: <path {...G} d="M4 9h11a3 3 0 1 0-3-3M4 15h14a3 3 0 1 1-3 3M4 12h8" />,
  sun: (
    <g {...G}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </g>
  ),
};

export interface VitalProps {
  icon: keyof typeof VITAL_ICON;
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  s?: Status;
  /** daily values, oldest first; flagged days are coloured */
  history?: { v: number | null; flag: Status | null }[];
  /** the person's usual range (drawn as a band) */
  lo?: number | null;
  hi?: number | null;
  /** a single reading on a scale: drawn as a value-against-range bar */
  range?: { min: number; max: number; v: number | null };
  note?: ReactNode;
  onClick?: () => void;
  on?: boolean;
}

export function Vital({ icon, label, value, unit, s = 'green', history, lo, hi, range, note, onClick, on }: VitalProps) {
  const W = 300;
  const H = 40;
  let chart: ReactNode = null;
  if (history && history.some((h) => h.v != null)) {
    const vals = history.map((h) => h.v).filter((x): x is number => x != null);
    let min = Math.min(...vals, lo ?? Infinity);
    let max = Math.max(...vals, hi ?? -Infinity);
    const pad = (max - min || 1) * 0.12;
    min -= pad;
    max += pad;
    const y = (x: number) => H - ((x - min) / (max - min)) * H;
    const bw = W / history.length;
    chart = (
      <svg className="fr-v-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        {lo != null && hi != null && <rect x="0" y={y(hi)} width={W} height={Math.max(1, y(lo) - y(hi))} className="fr-v-band" />}
        {history.map((h, i) =>
          h.v == null ? null : <rect key={i} x={i * bw + bw * 0.22} width={bw * 0.56} y={y(h.v)} height={Math.max(2, H - y(h.v))} className={`fr-v-bar${h.flag ? ` is-${h.flag}` : ''}${i === history.length - 1 ? ' is-today' : ''}`} />,
        )}
      </svg>
    );
  } else if (range && range.v != null) {
    const f = (x: number) => (Math.max(range.min, Math.min(range.max, x)) - range.min) / (range.max - range.min || 1);
    chart = (
      <span className="fr-v-range" aria-hidden>
        {lo != null && hi != null && <i className="fr-v-range-band" style={{ left: `${f(lo) * 100}%`, width: `${(f(hi) - f(lo)) * 100}%` }} />}
        <i className={`fr-v-range-dot is-${s}`} style={{ left: `${f(range.v) * 100}%` }} />
      </span>
    );
  }
  const body = (
    <>
      <span className="fr-v-head">
        <span className={`fr-v-icon is-${s}`}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {VITAL_ICON[icon]}
          </svg>
        </span>
        <span className="fr-v-t">
          <b>
            {value}
            {unit && <small>{unit}</small>}
          </b>
          <span>{label}</span>
        </span>
        {s !== 'green' && <Shape s={s} size={11} />}
      </span>
      {chart}
      {note && <span className="fr-v-note">{note}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={`fr-vital is-${s}${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {body}
    </button>
  ) : (
    <div className={`fr-vital is-${s}`}>{body}</div>
  );
}
