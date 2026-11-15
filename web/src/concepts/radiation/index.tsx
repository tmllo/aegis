// Radiation concept. Registered automatically and served at /concepts/radiation.
// Look is scoped under [data-concept="radiation"] in ./radiation.css.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Footer } from '../../components/Footer';
import { useMissionData } from '../../data/store';
import type { AlertLevel, StormForecast, StormMeta } from '../../data/types';
import type { ConceptMeta } from '../../registry';
import './radiation.css';

export const meta: ConceptMeta = {
  title: 'Radiation',
  direction: 'Sun disc, May 2024 replay, held-out test record',
  surface: 'Radiation',
};

/** Inclusive replay window: 1 May 2024 00:00 UTC through 20 May 2024 23:59 UTC. */
const REPLAY_START = Date.parse('2024-05-01T00:00:00Z');
const REPLAY_END = Date.parse('2024-05-20T23:59:00Z');
/** Wall-clock length of a full play-through. */
const PLAY_MS = 36_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const ALERT_RANK: Record<AlertLevel, number> = { none: 0, watch: 1, warning: 2 };

const AXIS_TICK = {
  fill: 'rgb(var(--text-faint))',
  fontSize: 12,
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
};

type ChartPoint = {
  id: string;
  t: number;
  p: number;
  alert: AlertLevel;
  flareClass: string;
  actual: boolean;
  onset: number | null;
  lead: number | null;
  lat: number | null;
  lon: number | null;
};

type OnsetMark = { t: number; warned: boolean };

type Prepared = {
  points: ChartPoint[];
  replay: ChartPoint[];
  onsets: OnsetMark[];
  replayOnsets: OnsetMark[];
  firstWarning: ChartPoint | null;
};

const SUN = { cx: 210, cy: 228, r: 150 };
const EARTH = { cx: 640, cy: 262, r: 28 };

let audio: AudioContext | null = null;

function armAudio(): AudioContext | null {
  const Ctx = window.AudioContext;
  audio = audio ?? new Ctx();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** Four beeps. No audio file. */
function playShelterAlarm(): void {
  try {
    const ctx = armAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    [740, 880, 740, 988].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      const start = t0 + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // A blocked audio context must not take the banner down with it.
  }
}

function formatUtc(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

function formatMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

function formatThreshold(p: number): string {
  if (p >= 0.1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(3);
  return p.toFixed(4);
}

/** Whole hours of warning. 39.9 h of lead is 39 h ahead. */
function hoursAhead(leadHours: number): number {
  return Math.floor(leadHours);
}

function falseAlarmFigure(n: number): { figure: string; label: string } {
  const rounded = Math.round(n * 10) / 10;
  const figure = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  const noun = rounded === 1 ? 'false alarm a month' : 'false alarms a month';
  const about = Math.abs(n - rounded) >= 0.05;
  return { figure, label: about ? `about ${noun}` : noun };
}

/** Log flare class → disc radius. M1 is small, X-class is large. */
function flareRadius(flareClass: string): number {
  const letter = flareClass.charAt(0).toUpperCase();
  const mag = Number.parseFloat(flareClass.slice(1));
  const decade = letter === 'X' ? 1 : letter === 'M' ? 0 : letter === 'C' ? -1 : -2;
  const log = decade + Math.log10(Number.isFinite(mag) && mag > 0 ? mag : 1);
  const clamped = Math.max(-0.3, Math.min(2, log));
  return 5 + ((clamped + 0.3) / 2.3) * 11;
}

/**
 * Orthographic Sun as seen from Earth.
 * Longitude is west-positive, so west lands on the right limb.
 * Returns null when the flare is on the far side.
 */
function project(
  lat: number | null,
  lon: number | null,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } | null {
  if (lat == null || lon == null) return null;
  const λ = (lon * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const facing = Math.cos(φ) * Math.cos(λ);
  if (facing < -1e-3) return null;
  return {
    x: cx + r * Math.cos(φ) * Math.sin(λ),
    y: cy - r * Math.sin(φ),
  };
}

function graticulePath(lat: number | null, lon: number | null): string {
  let d = '';
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const φ = lat ?? -75 + 150 * u;
    const λ = lon ?? -90 + 180 * u;
    const p = project(φ, λ, SUN.cx, SUN.cy, SUN.r);
    if (!p) continue;
    d += `${d ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }
  return d;
}

const GRID = {
  ordinary: [-60, -30, 30, 60].map((lat) => graticulePath(lat, null)).concat([-60, -30, 30, 60].map((lon) => graticulePath(null, lon))),
  principal: [graticulePath(0, null), graticulePath(null, 0)],
};

/** Leaves the western limb and bends onto Earth, the garden-hose spiral. */
function parkerPath(): string {
  const x0 = SUN.cx + SUN.r + 2;
  const y0 = SUN.cy;
  const x1 = EARTH.cx - EARTH.r - 1;
  const y1 = EARTH.cy;
  const c1x = x0 + (x1 - x0) * 0.42;
  const c1y = y0 - 8;
  const c2x = x0 + (x1 - x0) * 0.62;
  const c2y = y0 - 86;
  return `M${x0},${y0} C${c1x},${c1y} ${c2x},${c2y} ${x1},${y1}`;
}

const SPIRAL = parkerPath();

export function prepare(storm: StormForecast): Prepared {
  const points: ChartPoint[] = storm.events
    .filter((e) => e.split === 'test')
    .map((e) => ({
      id: e.flare_id,
      t: Date.parse(e.peak_time),
      p: e.p_storm,
      alert: e.alert_level,
      flareClass: e.flare_class,
      actual: e.actual_storm,
      onset: e.storm_onset_time ? Date.parse(e.storm_onset_time) : null,
      lead: e.lead_time_h,
      lat: e.latitude_deg,
      lon: e.longitude_deg,
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  const replay = points.filter((p) => p.t >= REPLAY_START && p.t < Date.parse('2024-05-21T00:00:00Z'));

  const onsetsOf = (list: ChartPoint[]): OnsetMark[] => {
    const warned = new Map<number, boolean>();
    for (const p of list) {
      if (p.onset == null || !Number.isFinite(p.onset)) continue;
      warned.set(p.onset, (warned.get(p.onset) ?? false) || p.alert === 'warning');
    }
    return [...warned.entries()].map(([t, wasWarned]) => ({ t, warned: wasWarned })).sort((a, b) => a.t - b.t);
  };

  return {
    points,
    replay,
    onsets: onsetsOf(points),
    replayOnsets: onsetsOf(replay),
    firstWarning: replay.find((p) => p.alert === 'warning') ?? null,
  };
}

function visibleUntil(replay: ChartPoint[], t: number): ChartPoint[] {
  let lo = 0;
  let hi = replay.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (replay[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return replay.slice(0, lo);
}

function halfYearTicks(start: number, end: number): number[] {
  const ticks: number[] = [];
  let year = new Date(start).getUTCFullYear();
  let month = 0;
  for (let guard = 0; guard < 24; guard++) {
    const t = Date.UTC(year, month, 1);
    if (t > end) break;
    if (t >= start) ticks.push(t);
    month += 6;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return ticks;
}

function alertFill(alert: AlertLevel): string {
  if (alert === 'warning') return 'rgb(var(--crit))';
  if (alert === 'watch') return 'rgb(var(--warn))';
  return 'rgb(176 198 216)';
}

function SunView({ flares }: { flares: ChartPoint[] }) {
  let pulseId: string | undefined;
  for (let i = flares.length - 1; i >= 0; i--) {
    if (flares[i].alert === 'warning') {
      pulseId = flares[i].id;
      break;
    }
  }

  const drawn = flares
    .map((f) => {
      const at = project(f.lat, f.lon, SUN.cx, SUN.cy, SUN.r);
      return at ? { f, ...at, radius: flareRadius(f.flareClass) } : null;
    })
    .filter((d): d is NonNullable<typeof d> => d != null)
    .sort((a, b) => ALERT_RANK[a.f.alert] - ALERT_RANK[b.f.alert] || a.f.t - b.f.t);

  return (
    <section className="rad-sky flex h-full min-h-0 flex-col overflow-hidden rounded border border-line p-4 xl:col-span-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Sun, as seen from Earth</h2>
        <p className="font-mono text-xs text-faint">{drawn.length} on the disc</p>
      </div>
      <p className="mt-1 text-xs text-dim">West to the right. Dot size is flare class. Colour is the alert.</p>
      <svg
        viewBox="0 0 720 460"
        className="mt-1 h-full min-h-0 w-full flex-1"
        role="img"
        aria-label={`Sun with ${drawn.length} flares on the Earth-facing disc. Earth is to the right, joined by the Parker spiral.`}
      >
        <defs>
          <radialGradient id="rad-sun" cx="46%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#fff6d4" />
            <stop offset="42%" stopColor="#ffc14d" />
            <stop offset="76%" stopColor="#ef8a22" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id="rad-earth" cx="32%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#b9dcff" />
            <stop offset="48%" stopColor="#2f6fe0" />
            <stop offset="100%" stopColor="#142e66" />
          </radialGradient>
          <marker id="rad-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill="rgb(var(--accent))" />
          </marker>
        </defs>

        <circle cx={SUN.cx} cy={SUN.cy} r={SUN.r + 18} fill="rgb(255 170 60)" opacity={0.12} />
        <circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill="url(#rad-sun)" />
        <g fill="none" stroke="rgb(90 40 8)" strokeOpacity={0.28} strokeWidth={1}>
          {GRID.ordinary.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g fill="none" stroke="rgb(90 40 8)" strokeOpacity={0.5} strokeWidth={1.25}>
          {GRID.principal.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill="none" stroke="rgb(255 236 200)" strokeOpacity={0.45} />

        {drawn.map((d) => (
          <circle
            key={d.f.id}
            className={d.f.id === pulseId ? 'rad-pulse' : undefined}
            cx={d.x}
            cy={d.y}
            r={d.radius}
            fill={alertFill(d.f.alert)}
            stroke="rgb(20 12 6)"
            strokeWidth={1}
          >
            <title>{`${d.f.flareClass} · ${d.f.alert} · p ${d.f.p.toFixed(2)} · ${formatUtc(d.f.t)}`}</title>
          </circle>
        ))}

        <text x={SUN.cx - SUN.r - 8} y={SUN.cy} textAnchor="end" dominantBaseline="middle" fill="rgb(var(--text-dim))" fontSize="13" fontFamily="JetBrains Mono, monospace">
          E
        </text>
        <text x={SUN.cx + SUN.r - 6} y={SUN.cy - SUN.r + 22} textAnchor="end" fill="rgb(var(--text-dim))" fontSize="13" fontFamily="JetBrains Mono, monospace">
          W
        </text>
        <text x={SUN.cx} y={SUN.cy + SUN.r + 22} textAnchor="middle" fill="rgb(var(--text-faint))" fontSize="12" fontFamily="JetBrains Mono, monospace">
          Sun
        </text>

        <path d={SPIRAL} fill="none" stroke="rgb(var(--accent))" strokeWidth={6} strokeOpacity={0.2} />
        <path d={SPIRAL} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} markerEnd="url(#rad-arrow)" />
        <text x={455} y={158} textAnchor="middle" fill="rgb(var(--accent))" fontSize="13" fontFamily="JetBrains Mono, monospace">
          Parker spiral
        </text>

        <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r + 5} fill="none" stroke="rgb(var(--accent))" strokeOpacity={0.55} />
        <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r} fill="url(#rad-earth)" />
        <text x={EARTH.cx} y={EARTH.cy + EARTH.r + 20} textAnchor="middle" fill="rgb(var(--text-dim))" fontSize="13" fontFamily="JetBrains Mono, monospace">
          Earth
        </text>
      </svg>
      <p className="text-xs text-faint">Earth and the spiral are a sketch, not to scale. Far-side flares stay off the disc.</p>
    </section>
  );
}

type ShapeProps = { cx?: number; cy?: number; payload?: ChartPoint };

function Dot({ cx, cy, payload, big }: ShapeProps & { big?: boolean }) {
  if (cx == null || cy == null || !payload) return <g />;
  const r = big ? (payload.alert === 'warning' ? 6 : 4.5) : payload.alert === 'warning' ? 4 : payload.alert === 'watch' ? 3 : 2.2;
  return (
    <g>
      {payload.actual && (
        <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="rgb(var(--text))" strokeWidth={1} />
      )}
      <circle cx={cx} cy={cy} r={r} fill={alertFill(payload.alert)} />
    </g>
  );
}

function ReplayDot(props: ShapeProps) {
  return <Dot {...props} big />;
}

function OverviewDot(props: ShapeProps) {
  return <Dot {...props} />;
}

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> };

function FlareTip({ active, payload }: TipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded border border-line bg-bg px-3 py-2 font-mono text-xs leading-relaxed">
      <div>
        {point.flareClass} · {point.alert}
      </div>
      <div>{formatUtc(point.t)}</div>
      <div>
        p {point.p.toFixed(2)}
        {point.actual ? ' · storm' : ''}
      </div>
    </div>
  );
}

function Legend({ watch, warning }: { watch: number; warning: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-dim">
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgb(176 198 216)' }} />
        none
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-warn" />
        watch {formatThreshold(watch)}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-crit" />
        warning {formatThreshold(warning)}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0 w-5 border-t border-dashed border-text" />
        storm onset
      </li>
    </ul>
  );
}

type ReplayChartProps = {
  points: ChartPoint[];
  onsets: OnsetMark[];
  watch: number;
  warning: number;
  t: number;
  horizonHours: number;
};

function ReplayChart({ points, onsets, watch, warning, t, horizonHours }: ReplayChartProps) {
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const mayTicks = [1, 5, 8, 10, 13, 15, 20].map((day) => Date.parse(`2024-05-${String(day).padStart(2, '0')}T00:00:00Z`));

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-line bg-surface p-4 xl:col-span-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">May 2024 replay</h2>
          <p className="mt-1 text-xs text-dim">p(storm) within {horizonHours} h of each flare</p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-4xl leading-none ${latest?.alert === 'warning' ? 'text-crit' : latest?.alert === 'watch' ? 'text-warn' : ''}`}>
            {latest ? latest.p.toFixed(2) : '—'}
          </p>
          <p className="mt-1 font-mono text-xs text-dim">{latest ? `${latest.flareClass} · ${latest.alert}` : 'waiting for the first flare'}</p>
        </div>
      </div>
      <div className="relative mt-2 min-h-0 flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[REPLAY_START, REPLAY_END]}
                ticks={mayTicks}
                tickFormatter={(v: number) => `${new Date(v).getUTCDate()} May`}
                tick={AXIS_TICK}
                stroke="rgb(var(--line))"
                tickLine={false}
              />
              <YAxis
                dataKey="p"
                type="number"
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={AXIS_TICK}
                stroke="rgb(var(--line))"
                tickLine={false}
                width={36}
              />
              <Tooltip content={<FlareTip />} cursor={{ stroke: 'rgb(var(--line))' }} />
              <ReferenceLine y={watch} stroke="rgb(var(--warn))" strokeWidth={2} strokeDasharray="5 3" />
              <ReferenceLine y={warning} stroke="rgb(var(--crit))" strokeWidth={2} strokeDasharray="5 3" />
              {onsets.map((o) => (
                <ReferenceLine
                  key={o.t}
                  x={o.t}
                  stroke="rgb(var(--text))"
                  strokeDasharray="3 3"
                  label={{ value: 'onset', position: 'insideTop', fill: 'rgb(var(--text-dim))', fontSize: 11 }}
                />
              ))}
              <ReferenceLine x={t} stroke="rgb(var(--accent))" strokeWidth={2} />
              <Scatter data={points} dataKey="p" fill="rgb(var(--accent))" shape={ReplayDot} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2">
        <Legend watch={watch} warning={warning} />
      </div>
    </section>
  );
}

type OverviewProps = {
  points: ChartPoint[];
  onsets: OnsetMark[];
  watch: number;
  warning: number;
  spanLabel: string;
};

const TestOverview = memo(function TestOverview({ points, onsets, watch, warning, spanLabel }: OverviewProps) {
  const t1 = points[points.length - 1]?.t ?? REPLAY_END;
  const axisStart = points[0] ? Date.UTC(new Date(points[0].t).getUTCFullYear(), 0, 1) : REPLAY_START;
  const ticks = halfYearTicks(axisStart, t1);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-line bg-surface p-4 xl:col-span-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Every flare, {spanLabel}</h2>
        <p className="font-mono text-xs text-faint">{points.length} test flares</p>
      </div>
      <div className="relative mt-2 min-h-0 flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[axisStart, t1]}
                ticks={ticks}
                tickFormatter={formatMonth}
                tick={AXIS_TICK}
                stroke="rgb(var(--line))"
                tickLine={false}
              />
              <YAxis
                dataKey="p"
                type="number"
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={AXIS_TICK}
                stroke="rgb(var(--line))"
                tickLine={false}
                width={36}
              />
              <Tooltip content={<FlareTip />} cursor={{ stroke: 'rgb(var(--line))' }} />
              <ReferenceLine y={watch} stroke="rgb(var(--warn))" strokeWidth={2} strokeDasharray="5 3" />
              <ReferenceLine y={warning} stroke="rgb(var(--crit))" strokeWidth={2} strokeDasharray="5 3" />
              {onsets.map((o) => (
                <ReferenceLine
                  key={o.t}
                  x={o.t}
                  stroke={o.warned ? 'rgb(var(--crit))' : 'rgb(var(--text-faint))'}
                  strokeDasharray="2 3"
                />
              ))}
              <Scatter data={points} dataKey="p" fill="rgb(var(--text-dim))" shape={OverviewDot} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">Rings mark flares that were followed by a storm. Dashed lines mark storm onsets.</p>
    </section>
  );
});

export function MetricsCard({ meta }: { meta: StormMeta }) {
  const m = meta.metrics_test;
  const caught = Math.round(m.hit_rate * m.n_storms);
  const alarms = falseAlarmFigure(m.false_alarms_per_month);
  const years = `${meta.test_period[0].slice(0, 4)}–${meta.test_period[1].slice(0, 4)}`;

  return (
    <section className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded border border-line bg-surface p-4 xl:col-span-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Test set · {years}</p>
        <p className="mt-1 text-sm text-dim">
          {m.n_flares.toLocaleString('en-US')} flares · {meta.horizon_hours} h horizon
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <dd className="font-display text-4xl font-medium leading-none">
            {caught}/{m.n_storms}
          </dd>
          <dt className="mt-1 text-sm text-dim">storms</dt>
        </div>
        <div>
          <dd className="font-display text-4xl font-medium leading-none">{alarms.figure}</dd>
          <dt className="mt-1 text-sm text-dim">{alarms.label}</dt>
        </div>
        <div>
          <dd className="font-display text-4xl font-medium leading-none">{m.median_lead_time_h.toFixed(1)} h</dd>
          <dt className="mt-1 text-sm text-dim">median lead</dt>
        </div>
        <div>
          <dd className="font-display text-4xl font-medium leading-none">{m.brier_skill_vs_climatology.toFixed(2)}</dd>
          <dt className="mt-1 text-sm text-dim">Brier skill vs climatology</dt>
        </div>
      </dl>
      <p className="mt-4 font-mono text-xs text-dim">Space weather data: {meta.data_credit}</p>
    </section>
  );
}

export default function RadiationConcept() {
  const { data, loadState, error } = useMissionData();
  const storm = data?.storm;
  const prepared = useMemo(() => (storm ? prepare(storm) : null), [storm]);

  const [t, setT] = useState(REPLAY_START);
  const [playing, setPlaying] = useState(false);
  const alarmArmed = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const speed = (REPLAY_END - REPLAY_START) / PLAY_MS;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => Math.min(REPLAY_END, prev + dt * speed));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (playing && t >= REPLAY_END) setPlaying(false);
  }, [playing, t]);

  const warningAt = prepared?.firstWarning?.t ?? null;
  const onsetAt = prepared?.firstWarning?.onset ?? null;
  const leadHours = prepared?.firstWarning?.lead;

  useEffect(() => {
    const crossed = warningAt != null && t >= warningAt;
    if (crossed && !alarmArmed.current) {
      alarmArmed.current = true;
      playShelterAlarm();
    } else if (!crossed) {
      alarmArmed.current = false;
    }
  }, [t, warningAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      armAudio();
      if (tRef.current >= REPLAY_END - 60_000) setT(REPLAY_START);
      setPlaying((on) => !on);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePlay = () => {
    armAudio();
    if (!playing && t >= REPLAY_END - 60_000) setT(REPLAY_START);
    setPlaying((on) => !on);
  };

  if (loadState === 'error') return <p className="p-8 text-crit">{error}</p>;
  if (!storm || !prepared) return null;

  const visible = visibleUntil(prepared.replay, t);
  const showBanner = warningAt != null && t >= warningAt;
  const showLead = showBanner && onsetAt != null && leadHours != null && t >= onsetAt;
  const leadText = leadHours != null ? `warned ${hoursAhead(leadHours)} h ahead` : '';
  const years = `${storm.meta.test_period[0].slice(0, 4)}–${storm.meta.test_period[1].slice(0, 4)}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg text-text" onPointerDown={armAudio}>
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={`rad-banner flex min-h-[4.25rem] shrink-0 flex-wrap items-center justify-center gap-x-10 gap-y-1 px-6 ${showBanner ? 'is-hot' : ''}`}
          role="status"
          aria-live="assertive"
          data-banner={showBanner ? 'warning' : 'quiet'}
          data-lead={showLead ? leadText : ''}
        >
          <p className="text-center font-display text-4xl font-semibold tracking-wide">
            {showBanner ? 'RADIATION WARNING: SHELTER NOW' : '1–20 May 2024'}
          </p>
          {showLead && <p className="text-center font-display text-3xl">{leadText}</p>}
        </div>

        <header className="flex shrink-0 items-baseline justify-between gap-4 px-4 py-2">
          <h1 className="font-display text-2xl font-medium tracking-tight">Radiation early warning</h1>
          <p className="font-mono text-xl" data-replay-time={new Date(t).toISOString()}>
            {formatUtc(t)}
          </p>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden px-4 pb-2 xl:grid-cols-12 xl:grid-rows-[minmax(0,1.2fr)_auto_minmax(0,0.7fr)]">
          <SunView flares={visible} />
          <ReplayChart
            points={visible}
            onsets={prepared.replayOnsets}
            watch={storm.meta.thresholds.watch}
            warning={storm.meta.thresholds.warning}
            t={t}
            horizonHours={storm.meta.horizon_hours}
          />

          <section className="flex shrink-0 items-center gap-4 xl:col-span-12">
            <button
              type="button"
              onClick={togglePlay}
              aria-pressed={playing}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              className="min-h-touch min-w-[7.5rem] rounded bg-accent px-6 font-semibold text-bg transition-colors duration-base ease-out hover:bg-accent/80"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={REPLAY_START}
                max={REPLAY_END}
                step={60_000}
                value={t}
                aria-label="Replay time"
                aria-valuetext={formatUtc(t)}
                onPointerDown={() => setPlaying(false)}
                onChange={(e) => setT(Number(e.target.value))}
              />
              <div className="flex justify-between font-mono text-[11px] text-faint">
                <span>{formatUtc(REPLAY_START)}</span>
                <span>{formatUtc(REPLAY_END)}</span>
              </div>
            </div>
          </section>

          <TestOverview
            points={prepared.points}
            onsets={prepared.onsets}
            watch={storm.meta.thresholds.watch}
            warning={storm.meta.thresholds.warning}
            spanLabel={years}
          />
          <MetricsCard meta={storm.meta} />
        </div>

        <Footer className="shrink-0" />
      </div>
    </div>
  );
}
