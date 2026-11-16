// e^x instrument frame: every page is the same panel.
//   title (centre top) · checklist (left) · object (centre) · vital cards and bars (right)
//   footer: page controls (left) · icon dock (centre) · main action (right)
// Status is always shape + word + colour.
import { useState, type ReactNode } from 'react';
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

/** Each row gets its own icon from what it is about (Emile, 16 Nov): status is the icon's colour, not a shape. */
const ROW_ICON: [RegExp, keyof typeof VITAL_ICON][] = [
  [/cardio|heart|blood pressure/i, 'heart'],
  [/neuro/i, 'brain'],
  [/sleep/i, 'sleep'],
  [/musculo|bone|muscle/i, 'bone'],
  [/radiation storm|storm|flare|forecast|radiation/i, 'sun'],
  [/shield/i, 'shield'],
  [/shelter/i, 'shelter'],
  [/act now/i, 'alert'],
  [/act today/i, 'clock'],
  [/watch/i, 'eye'],
  [/what to do/i, 'list'],
  [/mood/i, 'mood'],
  [/stress/i, 'stress'],
  [/energy/i, 'energy'],
  [/social/i, 'social'],
  [/daily check|check-?in/i, 'checklist'],
  [/status/i, 'pulse'],
  [/co2|o2|oxygen|air|cabin/i, 'air'],
  [/water|humid/i, 'drop'],
  [/temp|thermal/i, 'temp'],
  [/pressure/i, 'gauge'],
  [/glucose|sugar/i, 'sugar'],
  [/exercise/i, 'run'],
  [/dose/i, 'dose'],
  [/engineer|commander|specialist|medic|pilot|crew/i, 'person'],
];
function iconFor(title: ReactNode, word: ReactNode): keyof typeof VITAL_ICON {
  const s = `${typeof title === 'string' ? title : ''}`;
  const w = `${typeof word === 'string' ? word : ''}`;
  return ROW_ICON.find(([re]) => re.test(s))?.[1] ?? ROW_ICON.find(([re]) => re.test(w))?.[1] ?? 'pulse';
}

export function Check({ s, title, word, onClick, on, mark }: { s: Status; title: ReactNode; word: ReactNode; onClick?: () => void; on?: boolean; mark?: ReactNode }) {
  const body = (
    <>
      <span className={`fr-check-mark is-${mark != null ? 'plain' : s}${mark == null ? ' has-icon' : ''}`} aria-hidden>
        {mark ?? (
          <svg viewBox="0 0 24 24" width="18" height="18">
            {VITAL_ICON[iconFor(title, word)]}
          </svg>
        )}
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
  // a space habitat: pressurised module with a porthole, a truss, and two solar wings
  cabin: (
    <svg viewBox="0 0 24 24" {...I}>
      {/* satellite: body on the diagonal, two solar panels, antenna and signal arc */}
      <path d="m8.5 12 3.5 3.5 4.5-4.5L13 7.5Z" />
      <path d="m10.25 9.75-3.5-3.5L4 9l3.5 3.5M15.5 14.5l3.5 3.5-2.75 2.75-3.5-3.5" />
      <path d="m16.5 7.5 2.5-2.5" />
      <path d="M4 15.5a4.5 4.5 0 0 0 4.5 4.5M4 19.5h.01" />
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
  brain: <path {...G} d="M12 5.5a3 3 0 0 0-5.6 1.4A3 3 0 0 0 5 12a3 3 0 0 0 2 4.6A3 3 0 0 0 12 18.5m0-13a3 3 0 0 1 5.6 1.4A3 3 0 0 1 19 12a3 3 0 0 1-2 4.6 3 3 0 0 1-5 1.9m0-13v13" />,
  stress: <path {...G} d="M3 12h3.5l2-5 3.5 10 2.5-7 1.5 2H21" />,
  energy: <path {...G} d="M13 3 6 13.5h5.5L10.5 21 18 10h-5.5z" />,
  social: <path {...G} d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 8c.6-3.2 2.8-4.8 5.5-4.8s4.9 1.6 5.5 4.8M16 10.5a2.5 2.5 0 1 0 0-5M17 14.4c2 .5 3.3 2 3.6 4.6" />,
  person: <path {...G} d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 9c.7-3.8 3.3-5.8 6.5-5.8s5.8 2 6.5 5.8" />,
  shield: <path {...G} d="M12 3.5 5 6v5.5c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6z" />,
  shelter: <path {...G} d="M4 11 12 4.5l8 6.5M6.5 9.5V19.5h11V9.5M10 19.5v-5h4v5" />,
  alert: <path {...G} d="M12 4 3 19.5h18zM12 10v4.5M12 17v.01" />,
  clock: <path {...G} d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4.5l3 2" />,
  eye: <path {...G} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  list: <path {...G} d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  pulse: <path {...G} d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  drop: <path {...G} d="M12 3.5s6 6.6 6 10.5a6 6 0 0 1-12 0c0-3.9 6-10.5 6-10.5Z" />,
  gauge: <path {...G} d="M4.5 16a8 8 0 1 1 15 0M12 13l3.5-4" />,
  checklist: <path {...G} d="M5 4h14v17H5zM9 4V2.8h6V4M8.5 12.5l2.3 2.3 4.7-4.8" />,
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

/** 28-day trend (16 Nov): a smooth line with a soft area, the person's usual range as a quiet band, dots
 *  only on days outside it, today's value as a status-coloured marker, and a hover readout per day. */
function Trend({ history, lo, hi, s, unit }: { history: { v: number | null; flag: Status | null }[]; lo?: number | null; hi?: number | null; s: Status; unit: string }) {
  const [hov, setHov] = useState<number | null>(null);
  const W = 300;
  const H = 56;
  const T = 6;
  const B = 6;
  const vals = history.map((h) => h.v).filter((x): x is number => x != null);
  let min = Math.min(...vals, lo ?? Infinity);
  let max = Math.max(...vals, hi ?? -Infinity);
  const pad = (max - min || 1) * 0.15;
  min -= pad;
  max += pad;
  const n = history.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 8) + 4);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  // smooth path through the points (Catmull-Rom as cubic Beziers), broken at missing days
  const segs: { i: number; v: number }[][] = [];
  history.forEach((h, i) => {
    if (h.v == null) return void (segs.length && segs[segs.length - 1].length && segs.push([]));
    if (!segs.length) segs.push([]);
    segs[segs.length - 1].push({ i, v: h.v });
  });
  const pathOf = (pts: { i: number; v: number }[]) =>
    pts
      .map((p, k) => {
        if (k === 0) return `M${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
        const p0 = pts[k - 2] ?? pts[k - 1];
        const p1 = pts[k - 1];
        const p3 = pts[k + 1] ?? p;
        const c1x = x(p1.i) + (x(p.i) - x(p0.i)) / 6;
        const c1y = y(p1.v) + (y(p.v) - y(p0.v)) / 6;
        const c2x = x(p.i) - (x(p3.i) - x(p1.i)) / 6;
        const c2y = y(p.v) - (y(p3.v) - y(p1.v)) / 6;
        return `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
      })
      .join(' ');
  const last = [...history.keys()].reverse().find((i) => history[i].v != null)!;
  const h = hov != null ? history[hov] : null;
  const days = hov != null ? n - 1 - hov : 0;
  const fmt = (v: number) => {
    if (unit === 'h') {
      const m = Math.round(v * 60);
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }
    return Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : String(Math.round(v));
  };
  return (
    <span className="fr-v-trend">
      <svg
        className="fr-v-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const f = (e.clientX - r.left) / r.width;
          setHov(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
        }}
        onPointerLeave={() => setHov(null)}
      >
        <defs>
          <linearGradient id="frvArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="fr-v-area-top" />
            <stop offset="1" className="fr-v-area-bot" />
          </linearGradient>
        </defs>
        {lo != null && hi != null && <rect className="fr-v-band" x="0" width={W} y={y(hi)} height={Math.max(1, y(lo) - y(hi))} />}
        {segs
          .filter((g) => g.length > 1)
          .map((g, k) => (
            <path key={`a${k}`} className="fr-v-area" d={`${pathOf(g)} L${x(g[g.length - 1].i).toFixed(1)},${H} L${x(g[0].i).toFixed(1)},${H} Z`} fill="url(#frvArea)" />
          ))}
        {segs.map((g, k) => (g.length > 1 ? <path key={`l${k}`} className="fr-v-line" d={pathOf(g)} vectorEffect="non-scaling-stroke" /> : null))}
        {history.map((p, i) =>
          p.v != null && p.flag && p.flag !== 'green' && i !== last ? <circle key={i} className={`fr-v-dot is-${p.flag}`} cx={x(i)} cy={y(p.v)} r="2.2" vectorEffect="non-scaling-stroke" /> : null,
        )}
        {hov != null && <line className="fr-v-hair" x1={x(hov)} x2={x(hov)} y1="0" y2={H} vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* round markers drawn in HTML so they stay round on the stretched chart */}
      <i className={`fr-v-today is-${s}`} style={{ left: `${(x(last) / W) * 100}%`, top: `${(y(history[last].v!) / H) * 100}%` }} />
      {h && h.v != null && (
        <span className="fr-v-tip" style={{ left: `${(x(hov!) / W) * 100}%` }}>
          {fmt(h.v)} {unit} · {days === 0 ? 'today' : `${days} d ago`}
        </span>
      )}
    </span>
  );
}

export function Vital({ icon, label, value, unit, s = 'green', history, lo, hi, range, note, onClick, on }: VitalProps) {
  let chart: ReactNode = null;
  if (history && history.some((h) => h.v != null)) {
    chart = <Trend history={history} lo={lo} hi={hi} s={s} unit={typeof unit === 'string' ? unit : ''} />;
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
