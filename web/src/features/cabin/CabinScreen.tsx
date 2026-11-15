// 02 Cabin. The station around the crew, drawn as an environment instrument.
// Air and water: ISS Live! readings (server, else the recorded snapshot) against
// public/samples/cabin_catalog.json. Radiation: crew dose from crew_data.json and
// the storm predictor from storm_forecast.json. No value is written in this file.
import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cabinOverall, pressureEmergency, reportsToGround, type Bands, type CabinReading } from '../../core/cabin';
import { doseSummary, sortedEvents } from '../../core/radiation';
import { DOSE_CUM_AMBER_FRACTION, statusOn } from '../../core/scoring';
import { useCabin } from '../../data/cabin';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import type { AlertLevel, FlareEvent, Status } from '../../data/types';
import { falseAlarmFigure, flareRadius } from '../../concepts/radiation';
import { Shape, STATUS_WORD, StatusTag, Tween } from '../../ui/status';
import './cabin.css';

/** Days of forecast history drawn before the latest flare (a display window, not data). */
const HISTORY_DAYS = 30;
const DAY = 86_400_000;
const OUT = [0.16, 1, 0.3, 1] as const;
const ALERT: Record<AlertLevel, { status: Status; word: string }> = {
  none: { status: 'green', word: 'Quiet' },
  watch: { status: 'amber', word: 'Watch' },
  warning: { status: 'red', word: 'Warning' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fixed = (d: number) => (v: number) => v.toFixed(d);
const pct = (p: number) => `${Math.round(p * 100)}`;
function age(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}
function utc(ms: number, year = true): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''} ${hh}:${mm} UTC`;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ------------------------------------------------------------------ gauge geometry */

/** Range drawn for a band set: every edge and the value, padded. Same rule for rings and labels. */
function rangeOf(value: number, bands: Bands): { lo: number; hi: number } {
  const edges = [bands.red_low, bands.amber_low, bands.amber_high, bands.red_high].filter((v): v is number => v != null);
  const noLow = bands.red_low == null && bands.amber_low == null;
  let lo = Math.min(value, ...edges);
  let hi = Math.max(value, ...edges);
  if (noLow) lo = Math.min(0, lo);
  const pad = (hi - lo || 1) * 0.18;
  return { lo: noLow ? lo : lo - pad, hi: hi + pad };
}

/** Band zones between lo and hi, for the limit arcs. */
function zonesOf(bands: Bands, lo: number, hi: number): { from: number; to: number; s: Status }[] {
  const a = bands.red_low ?? lo;
  const b = bands.amber_low ?? a;
  const c = bands.amber_high ?? hi;
  const d = bands.red_high ?? c;
  const z: { from: number; to: number; s: Status }[] = [];
  if (bands.red_low != null) z.push({ from: lo, to: a, s: 'red' });
  if (bands.amber_low != null) z.push({ from: a, to: b, s: 'amber' });
  if (bands.amber_high != null) z.push({ from: c, to: d, s: 'amber' });
  if (bands.red_high != null) z.push({ from: d, to: hi, s: 'red' });
  return z;
}

const C = 300;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
};
function arc(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
/** The rings open at the top: the gap carries each ring's number. */
const A0 = 20;
const A1 = 340;

/* ------------------------------------------------------------------ air: concentric gauge rings + light numerals */

function AirRings({ air, overall }: { air: CabinReading[]; overall: Status }) {
  const step = 230 / Math.max(1, air.length);
  return (
    <svg className="cb-rings" viewBox="0 0 600 600" role="img" aria-label="Air readings against their limits">
      <circle className="cb-ring-halo" cx={C} cy={C} r={292} />
      {air.map((r, i) => {
        const rad = 280 - i * step;
        const v = r.value;
        const live = v != null && Object.keys(r.metric.bands).length > 0;
        const range = v != null ? rangeOf(v, r.metric.bands) : null;
        const at = (x: number) => (range ? A0 + ((x - range.lo) / (range.hi - range.lo)) * (A1 - A0) : A0);
        const [nx, ny] = polar(rad, v != null ? at(v) : A0);
        const [lx, ly] = polar(rad, 0);
        return (
          <g key={r.metric.key} className={`cb-ring${v == null ? ' is-empty' : ''}`} style={{ ['--i' as string]: i }}>
            <path className="cb-ring-track" d={arc(rad, A0, A1)} />
            {live &&
              range &&
              zonesOf(r.metric.bands, range.lo, range.hi).map((z) => (
                <path key={`${z.s}${z.from}`} className={`cb-ring-zone cb-zone-${z.s}`} d={arc(rad, at(z.from), at(z.to))} />
              ))}
            {live &&
              range &&
              [r.metric.bands.red_low, r.metric.bands.amber_low, r.metric.bands.amber_high, r.metric.bands.red_high]
                .filter((e): e is number => e != null)
                .map((e) => {
                  const [ax, ay] = polar(rad - 9, at(e));
                  const [bx, by] = polar(rad + 9, at(e));
                  return <line key={e} className="cb-ring-limit" x1={ax} y1={ay} x2={bx} y2={by} />;
                })}
            {v != null && <path className="cb-ring-value" d={arc(rad, A0, Math.max(A0 + 0.5, at(v)))} pathLength={1} />}
            {v != null &&
              (r.status === 'amber' ? (
                <path className="cb-ring-node fr-fill-amber" d={`M${nx} ${ny - 9}l9 16h-18Z`} />
              ) : r.status === 'red' ? (
                <rect className="cb-ring-node fr-fill-red" x={nx - 7} y={ny - 7} width="14" height="14" />
              ) : (
                <circle className="cb-ring-node" cx={nx} cy={ny} r="7" />
              ))}
            <text className="cb-ring-no" x={lx} y={ly + 5} textAnchor="middle">
              {String(i + 1).padStart(2, '0')}
            </text>
          </g>
        );
      })}
      <g className={`cb-ring-core fr-text-${overall}`}>
        <g transform={`translate(${C - 13} ${C - 40}) scale(1.625)`}>
          {overall === 'green' && <circle className="fr-fill-green" cx="8" cy="8" r="5" />}
          {overall === 'amber' && <path className="fr-fill-amber" d="M8 1.5 15 14.5H1Z" />}
          {overall === 'red' && <rect className="fr-fill-red" x="1.5" y="1.5" width="13" height="13" />}
        </g>
        <text x={C} y={C + 26} textAnchor="middle" className="cb-ring-word">
          {STATUS_WORD[overall]}
        </text>
      </g>
    </svg>
  );
}

function AirRow({ r, i }: { r: CabinReading; i: number }) {
  const m = r.metric;
  const planned = m.item == null;
  return (
    <li className={`cb-air-row${planned ? ' is-planned' : ''}`} style={{ animationDelay: `${120 + i * 40}ms` }}>
      <span className="fx-mono cb-air-no">{String(i + 1).padStart(2, '0')}</span>
      <span className="cb-air-name">{m.short}</span>
      {r.value == null ? (
        <span className="cb-air-empty">{planned ? 'Not connected' : 'No reading'}</span>
      ) : (
        <span className="cb-air-val">
          <span className="cb-light">
            <Tween value={r.value} format={fixed(m.digits)} />
          </span>
          <small>{m.unit}</small>
        </span>
      )}
      <span className="cb-air-status">
        {r.status ? <StatusTag status={r.status} size={14} /> : <span className="cb-dim">{planned ? 'Planned' : 'Display only'}</span>}
      </span>
      <span className="fx-mono cb-air-meta">
        <span className={`cb-src cb-src-${m.source.toLowerCase()}`}>{m.source}</span>
        {r.ageHours != null && <span className={r.stale ? 'cb-stale' : 'cb-dim'}>{r.stale ? `Stale ${age(r.ageHours)}` : age(r.ageHours)}</span>}
        {reportsToGround(r) && <span className="cb-ground">To ground</span>}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ water: glass vessels with limit ticks */

function Vessel({ r }: { r: CabinReading }) {
  const still = useReducedMotion();
  const v = r.value;
  const b = r.metric.bands;
  const ticks = [b.red_low, b.amber_low, b.amber_high, b.red_high].filter((t): t is number => t != null);
  const W = 64;
  const H = 230;
  const top = 6;
  const y = (p: number) => top + H - (Math.max(0, Math.min(100, p)) / 100) * H;
  const id = `cb-v-${r.metric.key.replace(/\W/g, '')}`;
  const fill = v == null ? 0 : Math.max(0, Math.min(100, v));
  return (
    <figure className="cb-vessel">
      <svg width={W + 52} height={H + 12} viewBox={`0 0 ${W + 52} ${H + 12}`} aria-hidden="true">
        <defs>
          <clipPath id={id}>
            <rect x="2" y={top} width={W} height={H} rx={W / 2} />
          </clipPath>
          <linearGradient id={`${id}-g`} x1="0" x2="1">
            <stop offset="0" stopColor="#f4f1ea" stopOpacity="0.16" />
            <stop offset="0.35" stopColor="#f4f1ea" stopOpacity="0.02" />
            <stop offset="1" stopColor="#f4f1ea" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect className="cb-vessel-glass" x="2" y={top} width={W} height={H} rx={W / 2} fill={`url(#${id}-g)`} />
        <g clipPath={`url(#${id})`}>
          {v != null && (
            <motion.rect
              className={`cb-vessel-fill cb-vfill-${r.status ?? 'green'}`}
              x="2"
              width={W}
              initial={still ? false : { y: top + H, height: 0 }}
              animate={{ y: y(fill), height: (fill / 100) * H }}
              transition={{ duration: 0.8, ease: OUT }}
            />
          )}
          {v != null && (
            <motion.line
              className="cb-vessel-meniscus"
              x1="2"
              x2={W + 2}
              initial={still ? false : { y1: top + H, y2: top + H }}
              animate={{ y1: y(fill), y2: y(fill) }}
              transition={{ duration: 0.8, ease: OUT }}
            />
          )}
        </g>
        <rect className="cb-vessel-rim" x="2" y={top} width={W} height={H} rx={W / 2} />
        {ticks.map((t) => (
          <g key={t}>
            <line className="cb-vessel-tick" x1={W + 6} x2={W + 16} y1={y(t)} y2={y(t)} />
            <text className="cb-vessel-ticklabel" x={W + 20} y={y(t) + 5}>
              {t}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <p className="cb-vessel-val">
          {v == null ? <span className="cb-dim">None</span> : <span className="cb-light"><Tween value={v} format={fixed(r.metric.digits)} /></span>}
          <small>{r.metric.unit}</small>
        </p>
        <p className="cb-vessel-name">{r.metric.short}</p>
        {r.status && <StatusTag status={r.status} size={14} className="cb-vessel-status" />}
        {r.ageHours != null && <p className={`fx-mono ${r.stale ? 'cb-stale' : 'cb-dim'}`}>{age(r.ageHours)}</p>}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ radiation: dose arc and the storm forecast */

function DoseArc({ fraction, status }: { fraction: number; status: Status }) {
  const f = Math.max(0, Math.min(1, fraction));
  const r = 120;
  const toDeg = (x: number) => -90 + x * 180;
  const [ax, ay] = polar(r - 12, toDeg(DOSE_CUM_AMBER_FRACTION));
  const [bx, by] = polar(r + 12, toDeg(DOSE_CUM_AMBER_FRACTION));
  const [nx, ny] = polar(r, toDeg(f));
  return (
    <svg className="cb-dose-arc" viewBox={`${C - 140} ${C - 140} 280 152`} aria-hidden="true">
      <path className="cb-ring-track" d={arc(r, -90, 90)} />
      <path className="cb-ring-zone cb-zone-amber" d={arc(r, toDeg(DOSE_CUM_AMBER_FRACTION), 90)} />
      <line className="cb-ring-limit" x1={ax} y1={ay} x2={bx} y2={by} />
      <path className={`cb-ring-value${status !== 'green' ? ` cb-stroke-${status}` : ''}`} d={arc(r, -90, Math.max(-89.5, toDeg(f)))} pathLength={1} />
      <circle className="cb-ring-node" cx={nx} cy={ny} r="7" />
    </svg>
  );
}

function StormChart({ events, latest, horizonH, watch, warning }: { events: FlareEvent[]; latest: FlareEvent; horizonH: number; watch: number; warning: number }) {
  const [box, size] = useSize<HTMLDivElement>();
  const t1 = Date.parse(latest.peak_time) + horizonH * 3_600_000;
  const t0 = Date.parse(latest.peak_time) - HISTORY_DAYS * DAY;
  let chart = null;
  if (size.w > 0 && size.h > 0) {
    const L = 0;
    const Rgt = 112;
    const T = 34;
    const B = 30;
    const pw = size.w - L - Rgt;
    const ph = size.h - T - B;
    const ymax = Math.max(warning * 1.25, ...events.map((e) => e.p_storm));
    const x = (t: number) => L + ((t - t0) / (t1 - t0)) * pw;
    // Square-root scale: small probabilities stay visible, the lines are labelled with their values.
    const y = (p: number) => T + ph - Math.sqrt(Math.max(0, p) / ymax) * ph;
    const lt = Date.parse(latest.peak_time);
    const ticks: number[] = [];
    for (let t = Math.ceil(t0 / (7 * DAY)) * 7 * DAY; t < lt; t += 7 * DAY) ticks.push(t);
    chart = (
      <svg width={size.w} height={size.h} role="img" aria-label={`Storm probability of each flare in the last ${HISTORY_DAYS} days`}>
        <rect className="cb-storm-window" x={x(lt)} y={T - 6} width={x(t1) - x(lt)} height={ph + 6} />
        <text className="cb-chart-cap" x={(x(lt) + x(t1)) / 2} y={T - 16} textAnchor="middle">
          Next {horizonH} h
        </text>
        <line className="cb-storm-base" x1={L} x2={L + pw} y1={T + ph} y2={T + ph} />
        {[
          { p: warning, k: 'Warning', s: 'red' },
          { p: watch, k: 'Watch', s: 'amber' },
        ].map((l) => (
          <g key={l.k}>
            <line className={`cb-storm-line cb-stroke-${l.s}`} x1={L} x2={L + pw} y1={y(l.p)} y2={y(l.p)} />
            <text className="cb-chart-num" x={L + pw + 10} y={y(l.p) + 5}>
              {l.k} {pct(l.p)}%
            </text>
          </g>
        ))}
        {ticks.map((t) => {
          const d = new Date(t);
          return (
            <text key={t} className="cb-chart-num" x={x(t)} y={size.h - 6} textAnchor="middle">
              {d.getUTCDate()} {MONTHS[d.getUTCMonth()]}
            </text>
          );
        })}
        {events.map((e, i) => {
          const t = Date.parse(e.peak_time);
          const a = ALERT[e.alert_level];
          const isLast = e.flare_id === latest.flare_id;
          return (
            <g key={e.flare_id} className="cb-stem" style={{ ['--i' as string]: i }}>
              <line className="cb-stem-line" x1={x(t)} x2={x(t)} y1={T + ph} y2={y(e.p_storm)} />
              <circle className={`cb-stem-dot fr-fill-${a.status}`} cx={x(t)} cy={y(e.p_storm)} r={isLast ? 6 : 4} />
              {isLast && <circle className="cb-stem-ring" cx={x(t)} cy={y(e.p_storm)} r="13" />}
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <div className="cb-storm-chart" ref={box}>
      {chart}
    </div>
  );
}

/** The Sun as seen from Earth (west on the right), with the window's flares where they peaked. */
function SunDisc({ events, latest }: { events: FlareEvent[]; latest: FlareEvent }) {
  const R = 84;
  const cx = 100;
  const cy = 100;
  const proj = (lat: number, lon: number) => {
    const p = (lat * Math.PI) / 180;
    const l = (lon * Math.PI) / 180;
    if (Math.cos(p) * Math.cos(l) < 0) return null;
    return [cx + R * Math.cos(p) * Math.sin(l), cy - R * Math.sin(p)] as const;
  };
  const meridian = (lon: number) => {
    let d = '';
    for (let lat = -80; lat <= 80; lat += 8) {
      const q = proj(lat, lon);
      if (q) d += `${d ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }
    return d;
  };
  return (
    <svg className="cb-sun" viewBox="0 0 200 214" role="img" aria-label="Flare positions on the Sun, west to the right">
      <defs>
        <radialGradient id="cb-sun-g" cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#f0b27a" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#c4622d" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7a3418" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R + 14} className="cb-sun-corona" />
      <circle cx={cx} cy={cy} r={R} fill="url(#cb-sun-g)" className="cb-sun-limb" />
      {[-60, -30, 0, 30, 60].map((lon) => (
        <path key={lon} className="cb-sun-grid" d={meridian(lon)} />
      ))}
      {[-45, 0, 45].map((lat) => {
        const yy = cy - R * Math.sin((lat * Math.PI) / 180);
        const half = R * Math.cos((lat * Math.PI) / 180);
        return <line key={lat} className="cb-sun-grid" x1={cx - half} x2={cx + half} y1={yy} y2={yy} />;
      })}
      {events.map((e) => {
        if (e.latitude_deg == null || e.longitude_deg == null) return null;
        const q = proj(e.latitude_deg, e.longitude_deg);
        if (!q) return null;
        const isLast = e.flare_id === latest.flare_id;
        return (
          <g key={e.flare_id}>
            <circle className={`fr-fill-${ALERT[e.alert_level].status} cb-sun-dot`} cx={q[0]} cy={q[1]} r={flareRadius(e.flare_class) * 0.4} />
            {isLast && <circle className="cb-stem-ring" cx={q[0]} cy={q[1]} r="10" />}
          </g>
        );
      })}
      <text className="cb-chart-num" x={cx - R - 4} y={cy + 5} textAnchor="end">E</text>
      <text className="cb-chart-num" x={cx + R + 4} y={cy + 5}>W</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ console: the red-framed emergency block */

function HoldButton({ armed, label, sub }: { armed: boolean; label: string; sub: string }) {
  const [done, setDone] = useState(false);
  const fill = useRef<HTMLSpanElement>(null);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const still = useReducedMotion();
  useEffect(() => () => run.current?.stop(), []);
  useEffect(() => {
    if (!armed) setDone(false);
  }, [armed]);
  const start = () => {
    if (!armed || done || run.current) return;
    run.current = animate(0, 1, {
      duration: still ? 0.01 : 0.9,
      ease: 'linear',
      onUpdate: (v) => fill.current && (fill.current.style.transform = `scaleX(${v})`),
      onComplete: () => {
        run.current = null;
        setDone(true);
      },
    });
  };
  const cancel = () => {
    if (!run.current) return;
    run.current.stop();
    run.current = null;
    if (fill.current) fill.current.style.transform = 'scaleX(0)';
  };
  return (
    <button
      className={`cb-hold${armed ? ' is-armed' : ''}${done ? ' is-done' : ''}`}
      disabled={!armed}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (done ? setDone(false) : start())}
      onKeyUp={cancel}
      onClick={() => done && setDone(false)}
    >
      <span className="cb-hold-fill" ref={fill} />
      <span className="cb-lamp" aria-hidden="true" />
      <span className="cb-hold-text">
        <b>{done ? 'Response started' : label}</b>
        <small>{done ? 'Tap to undo' : sub}</small>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ screen */

export default function CabinScreen() {
  const { data } = useMissionData();
  const member = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const { cabin, error } = useCabin();

  if (error) return <p className="cb-root cb-error">{error}</p>;
  if (!data || !member || !environment || !cabin) return <div className="cb-root" />;

  const air = cabin.readings.filter((r) => !r.metric.tank);
  const tanks = cabin.readings.filter((r) => r.metric.tank);
  const overall = cabinOverall(cabin.readings);
  const emergency = pressureEmergency(cabin.readings);
  const pressure = cabin.readings.find((r) => r.metric.emergency_below != null) ?? null;

  const crew = data.crew;
  const dose = doseSummary(member, crew, environment);
  const scores = statusOn(member, crew, crew.mission.today, environment).scores;
  const doseStatus = (k: 'dose_mSv_day' | 'dose_mSv_cum'): Status | null => scores.find((s) => s.metric === k)?.status ?? null;
  const storm = data.storm;
  const all = sortedEvents(storm);
  const latest = all[all.length - 1];
  const from = latest ? Date.parse(latest.peak_time) - HISTORY_DAYS * DAY : 0;
  const recent = all.filter((e) => Date.parse(e.peak_time) >= from);
  const { watch, warning } = storm.meta.thresholds;
  const m = storm.meta.metrics_test;
  const alarms = falseAlarmFigure(m.false_alarms_per_month);
  const years = `${storm.meta.test_period[0].slice(0, 4)}–${storm.meta.test_period[1].slice(0, 4)}`;
  const surname = member.name.split(' ').slice(-1)[0];

  return (
    <div className="cb-root">
      <div className="cb-haze" aria-hidden="true" />
      {emergency && (
        <motion.div className="cb-emergency" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert">
          <Shape status="red" size={22} />
          Cabin pressure low. Reported to ground.
        </motion.div>
      )}

      <header className="cb-head">
        <div className="cb-title">
          <p className="cb-kicker">
            <span className="fx-mono">02</span>
            <span className="fx-mono cb-kicker-of">/02</span>
            <span className="fx-label">Station environment</span>
          </p>
          <div className="cb-title-row">
            <h1 className="cb-h1">
              <span className="fx-mask"><span>Cabin.</span></span>
            </h1>
            <p className={`cb-overall fr-text-${overall}`}>
              <Shape status={overall} size={26} />
              {STATUS_WORD[overall]}
            </p>
          </div>
        </div>
        <p className="fx-mono cb-origin">
          <span>{cabin.origin === 'server' ? 'ISS Live via e^x server' : 'ISS Live, recorded'}</span>
          <span>{utc(cabin.now)}</span>
          <span className={cabin.signal ? '' : 'cb-stale'}>
            <i className={`cb-sig${cabin.signal ? ' is-on' : ''}`} />
            {cabin.signal ? 'Signal' : 'No signal'}
          </span>
        </p>
      </header>

      <section className="cb-air" aria-label="Air">
        <div className="cb-rings-box">
          <AirRings air={air} overall={overall} />
        </div>
        <div className="cb-air-list">
          <p className="cb-sec fx-label">Air</p>
          <ol>
            {air.map((r, i) => (
              <AirRow key={r.metric.key} r={r} i={i} />
            ))}
          </ol>
        </div>
      </section>

      <section className="cb-water cb-glass" aria-label="Water">
        <p className="cb-sec fx-label">Water</p>
        <div className="cb-vessels">
          {tanks.map((r) => (
            <Vessel key={r.metric.key} r={r} />
          ))}
        </div>
      </section>

      <section className="cb-dose cb-glass" aria-label="Radiation dose">
        <p className="cb-sec fx-label">Dose / {surname}</p>
        <div className="cb-dose-gauge">
          {dose.fraction != null && <DoseArc fraction={dose.fraction} status={doseStatus('dose_mSv_cum') ?? 'green'} />}
          <p className="cb-dose-num">
            <span className="cb-light">{dose.cumulative_mSv == null ? 'None' : <Tween value={dose.cumulative_mSv} format={fixed(1)} />}</span>
            <small>of {dose.careerLimit_mSv} mSv</small>
          </p>
        </div>
        <p className="fx-mono cb-dim cb-dose-left">
          {dose.fraction == null ? '' : `${(dose.fraction * 100).toFixed(1)}% of career limit`}
          {dose.daysToLimit != null && ` / ${Math.round(dose.daysToLimit).toLocaleString('en-US')} days left`}
        </p>
        <div className="cb-dose-today">
          <span className="fx-label">Today</span>
          <span className="cb-dose-day">
            <span className="cb-light">{dose.daily_mSv == null ? 'None' : <Tween value={dose.daily_mSv} format={fixed(2)} />}</span>
            <small>mSv</small>
          </span>
          {doseStatus('dose_mSv_day') && <StatusTag status={doseStatus('dose_mSv_day')!} size={14} />}
        </div>
        <p className="fx-mono cb-dim">
          {crew.environments[environment].label} {dose.environmentDaily_mSv} mSv/day
        </p>
      </section>

      {latest && (
        <section className="cb-storm cb-glass" aria-label="Radiation storm forecast">
          <div className="cb-storm-head">
            <p className="cb-sec fx-label">Storm forecast</p>
            <div className="cb-storm-now">
              <span className="cb-storm-p">
                <span className="cb-light">{pct(latest.p_storm)}</span>
                <small>%</small>
              </span>
              <span className="cb-storm-what">
                <span className={`fx-status cb-storm-alert fr-text-${ALERT[latest.alert_level].status}`}>
                  <Shape status={ALERT[latest.alert_level].status} size={16} />
                  {ALERT[latest.alert_level].word}
                </span>
                <span className="fx-mono cb-dim">
                  {latest.flare_class} / {utc(Date.parse(latest.peak_time), false)}
                </span>
              </span>
            </div>
            <p className="fx-mono cb-dim cb-storm-key">
              p(storm) within {storm.meta.horizon_hours} h / last {HISTORY_DAYS} days / {storm.meta.model}
            </p>
          </div>
          <SunDisc events={recent} latest={latest} />
          <StormChart events={recent} latest={latest} horizonH={storm.meta.horizon_hours} watch={watch} warning={warning} />
        </section>
      )}

      <section className="cb-model cb-glass" aria-label="Forecast model, held-out test">
        <p className="cb-sec fx-label">
          Test set {years} <span className="fx-mono cb-dim">{m.n_flares.toLocaleString('en-US')} flares</span>
        </p>
        <dl className="cb-model-grid">
          <div>
            <dd className="cb-light">
              {Math.round(m.hit_rate * m.n_storms)}/{m.n_storms}
            </dd>
            <dt>storms caught</dt>
          </div>
          <div>
            <dd className="cb-light">{m.median_lead_time_h.toFixed(1)} h</dd>
            <dt>median lead</dt>
          </div>
          <div>
            <dd className="cb-light">{alarms.figure}</dd>
            <dt>{alarms.label}</dt>
          </div>
          <div>
            <dd className="cb-light">{m.brier_skill_vs_climatology.toFixed(2)}</dd>
            <dt>Brier skill</dt>
          </div>
        </dl>
        <p className="fx-mono cb-dim">Space weather data: {storm.meta.data_credit}</p>
      </section>

      <section className="cb-console" aria-label="Controls">
        <div className={`cb-emerg${emergency ? ' is-live' : ''}`}>
          <p className="cb-emerg-cap">Cabin emergency</p>
          <HoldButton armed={emergency} label="Depress response" sub={emergency ? 'Press and hold' : 'Standby'} />
          {pressure && pressure.value != null && (
            <p className="cb-emerg-read fx-mono">
              <span>Pressure {pressure.value.toFixed(pressure.metric.digits)} {pressure.metric.unit}</span>
              <span className="cb-dim">Floor {pressure.metric.emergency_below} {pressure.metric.unit}</span>
            </p>
          )}
        </div>
        <Link to="/cabin/replay" className={`cb-replay fx-press${emergency ? ' is-quiet' : ''}`}>
          <span>
            <b>Replay May 2024</b>
            <small>Warning before particles arrive</small>
          </span>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 14h19M16 6l8 8-8 8" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
