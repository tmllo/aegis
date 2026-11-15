// May 2024 storm replay: Tomas's storm model (held-out test flares only) played through the
// 5-20 May 2024 storm, in the console's Crew pattern: one caption, one huge status word, one
// detail line, hairlines and bracket corners, white primary and outlined secondary buttons.
// Left: the read. Right: the Sun as seen from Earth with each flare at its position. Bottom: the
// p(storm) timeline with the watch and warning lines, storm onsets, misses and false alarms.
// Look: ./replay.css, scoped to .rp.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { audioOn } from '../audio';
import { useMissionData } from '../../data/store';
import type { AlertLevel, StormForecast, StormMeta } from '../../data/types';

import './replay.css';


const START = Date.parse('2024-05-05T00:00:00Z');
const END = Date.parse('2024-05-20T23:59:00Z');
/** Wall-clock length of a full play-through. */
const PLAY_MS = 30_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WORD: Record<AlertLevel, string> = { none: 'Quiet', watch: 'Watch', warning: 'Warning' };
const SHELTER = 'SEP likely: suspend EVA, crew to shelter (mission rule)';

export type Outcome = 'hit' | 'miss' | 'false-alarm' | 'none';

export interface Flare {
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
  outcome: Outcome;
}

export interface Prepared {
  flares: Flare[];
  /** storm onsets in the window, and whether any flare before them had raised a warning */
  onsets: { t: number; warned: boolean }[];
  firstWarning: Flare | null;
  hits: number;
  misses: number;
  falseAlarms: number;
}

/** Test-split flares from 5 to 20 May 2024, each labelled hit / miss / false alarm. */
export function prepare(storm: StormForecast): Prepared {
  const flares: Flare[] = storm.events
    .filter((e) => e.split === 'test')
    .map((e) => {
      const t = Date.parse(e.peak_time);
      const warned = e.alert_level === 'warning';
      const outcome: Outcome = warned && e.actual_storm ? 'hit' : warned ? 'false-alarm' : e.actual_storm ? 'miss' : 'none';
      return {
        id: e.flare_id,
        t,
        p: e.p_storm,
        alert: e.alert_level,
        flareClass: e.flare_class,
        actual: e.actual_storm,
        onset: e.storm_onset_time ? Date.parse(e.storm_onset_time) : null,
        lead: e.lead_time_h,
        lat: e.latitude_deg,
        lon: e.longitude_deg,
        outcome,
      };
    })
    .filter((f) => Number.isFinite(f.t) && f.t >= START && f.t <= END)
    .sort((a, b) => a.t - b.t);

  const byOnset = new Map<number, boolean>();
  for (const f of flares) {
    if (f.onset == null || !Number.isFinite(f.onset)) continue;
    byOnset.set(f.onset, (byOnset.get(f.onset) ?? false) || f.alert === 'warning');
  }
  const onsets = [...byOnset.entries()].map(([t, warned]) => ({ t, warned })).sort((a, b) => a.t - b.t);
  return {
    flares,
    onsets,
    firstWarning: flares.find((f) => f.alert === 'warning') ?? null,
    hits: onsets.filter((o) => o.warned).length,
    misses: onsets.filter((o) => !o.warned).length,
    falseAlarms: flares.filter((f) => f.outcome === 'false-alarm').length,
  };
}

export function falseAlarmFigure(n: number): { figure: string; label: string } {
  const rounded = Math.round(n * 10) / 10;
  const figure = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return { figure, label: rounded === 1 ? 'false alarm a month' : 'false alarms a month' };
}

/** Log flare class -> dot radius on the Sun. C1 small, X10 large. */
export function flareRadius(flareClass: string): number {
  const letter = flareClass.charAt(0).toUpperCase();
  const mag = Number.parseFloat(flareClass.slice(1));
  const decade = letter === 'X' ? 1 : letter === 'M' ? 0 : letter === 'C' ? -1 : -2;
  const log = decade + Math.log10(Number.isFinite(mag) && mag > 0 ? mag : 1);
  return 3 + ((Math.max(-1, Math.min(2, log)) + 1) / 3) * 9;
}

function utc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/** Orthographic Sun seen from Earth; longitude west-positive, so west is on the right limb. */
function onDisc(lat: number | null, lon: number | null, r: number): { x: number; y: number } | null {
  if (lat == null || lon == null) return null;
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  if (Math.cos(la) * Math.cos(lo) < 0) return null; // far side
  return { x: r * Math.cos(la) * Math.sin(lo), y: -r * Math.sin(la) };
}

function playAlarm() {
  if (!audioOn()) return; // follows the console's Sound switch
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime + 0.02;
    [740, 880, 740, 988].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const s = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.2, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(s);
      o.stop(s + 0.2);
    });
  } catch {
    /* no audio: the banner still shows */
  }
}

const SUN_R = 150;

function Sun({ flares, latestId }: { flares: Flare[]; latestId: string | null }) {
  const dots = flares
    .map((f) => ({ f, at: onDisc(f.lat, f.lon, SUN_R) }))
    .filter((d): d is { f: Flare; at: { x: number; y: number } } => d.at != null);
  const grid = [-60, -30, 0, 30, 60];
  return (
    <svg className="rp-sun" viewBox="-190 -190 380 380" role="img" aria-label={`Sun as seen from Earth with ${dots.length} flares on the near side`}>
      <defs>
        <radialGradient id="rp-sun-g" cx="45%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#fff3d6" />
          <stop offset="55%" stopColor="#f6b25a" />
          <stop offset="100%" stopColor="#a8471a" />
        </radialGradient>
      </defs>
      <circle r={SUN_R + 22} fill="#f6a24a" opacity={0.06} />
      <circle r={SUN_R} fill="url(#rp-sun-g)" opacity={0.92} />
      <g fill="none" stroke="#3a1606" strokeOpacity={0.12}>
        {grid.map((la) => {
          const y = -SUN_R * Math.sin((la * Math.PI) / 180);
          const w = SUN_R * Math.cos((la * Math.PI) / 180);
          return <line key={`la${la}`} x1={-w} x2={w} y1={y} y2={y} />;
        })}
      </g>
      {dots.map(({ f, at }) => (
        <circle
          key={f.id}
          cx={at.x}
          cy={at.y}
          r={flareRadius(f.flareClass)}
          className={`rp-dot is-${f.outcome === 'none' ? f.alert : f.outcome}${f.id === latestId ? ' is-latest' : ''}`}
        >
          <title>{`${f.flareClass} · p ${f.p.toFixed(2)} · ${utc(f.t)}`}</title>
        </circle>
      ))}
      <text x={-SUN_R - 12} y={4} textAnchor="end" className="rp-axis">E</text>
      <text x={SUN_R + 12} y={4} className="rp-axis">W</text>
    </svg>
  );
}

const TL = { w: 1000, h: 150, top: 14, bottom: 120 };
const xOf = (t: number) => ((t - START) / (END - START)) * TL.w;
/** square-root scale: the thresholds sit low (watch ~0.04, warning ~0.16), so a linear axis hides them */
const yOf = (p: number) => TL.bottom - Math.sqrt(Math.max(0, Math.min(1, p))) * (TL.bottom - TL.top);
const pct = (p: number) => ((TL.h - yOf(p)) / TL.h) * 100;
const fmtP = (p: number) => (p >= 0.1 ? p.toFixed(2) : p.toFixed(3));

function Timeline({
  prep,
  t,
  watch,
  warning,
  onSeek,
}: {
  prep: Prepared;
  t: number;
  watch: number;
  warning: number;
  onSeek: (t: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const seekAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onSeek(START + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (END - START));
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    seekAt(e.clientX);
  };
  return (
    <svg
      ref={ref}
      className="rp-tl"
      viewBox={`0 0 ${TL.w} ${TL.h}`}
      preserveAspectRatio="none"
      onPointerDown={down}
      onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
      aria-hidden
    >
      <line x1={0} x2={TL.w} y1={TL.bottom} y2={TL.bottom} className="rp-base" />
      <line x1={0} x2={TL.w} y1={yOf(watch)} y2={yOf(watch)} className="rp-th is-watch" />
      <line x1={0} x2={TL.w} y1={yOf(warning)} y2={yOf(warning)} className="rp-th is-warning" />
      {prep.onsets.map((o) => (
        <line key={o.t} x1={xOf(o.t)} x2={xOf(o.t)} y1={TL.top - 6} y2={TL.bottom} className={`rp-onset${o.warned ? '' : ' is-miss'}`} />
      ))}
      {prep.flares
        .filter((f) => f.t <= t)
        .map((f) => (
          <circle key={f.id} cx={xOf(f.t)} cy={yOf(f.p)} r={f.alert === 'warning' ? 4.5 : f.alert === 'watch' ? 3.5 : 2.5} className={`rp-dot is-${f.outcome === 'none' ? f.alert : f.outcome}`} vectorEffect="non-scaling-stroke" />
        ))}
      <line x1={xOf(t)} x2={xOf(t)} y1={0} y2={TL.bottom + 4} className="rp-head" />
    </svg>
  );
}

function Proof({ meta: m }: { meta: StormMeta }) {
  const mt = m.metrics_test;
  const caught = Math.round(mt.hit_rate * mt.n_storms);
  const fa = falseAlarmFigure(mt.false_alarms_per_month);
  return (
    <span className="cap rp-proof">
      Test {m.test_period[0].slice(0, 4)}–{m.test_period[1].slice(0, 4)} · {caught} of {mt.n_storms} storms caught · {fa.figure} {fa.label} · median {mt.median_lead_time_h.toFixed(1)} h ahead
    </span>
  );
}

export default function StormReplay() {
  const { data, loadState, error } = useMissionData();
  const storm = data?.storm;
  const prep = useMemo(() => (storm ? prepare(storm) : null), [storm]);
  const [t, setT] = useState(START);
  const [playing, setPlaying] = useState(false);
  const alarmed = useRef(false);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const speed = (END - START) / PLAY_MS;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = Math.min(END, prev + dt * speed);
        if (next >= END) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const warnAt = prep?.firstWarning?.t ?? null;
  const onsetAt = prep?.firstWarning?.onset ?? null;
  const lead = prep?.firstWarning?.lead ?? null;
  const sheltered = warnAt != null && t >= warnAt;

  useEffect(() => {
    if (sheltered && !alarmed.current) {
      alarmed.current = true;
      playAlarm();
    } else if (!sheltered) alarmed.current = false;
  }, [sheltered]);

  if (loadState === 'error') return <p className="cx-error">{error ?? 'Storm data could not load. Reload the page.'}</p>;
  if (!storm || !prep) return <p className="cx-error cx-wait">Loading</p>;

  const seen = prep.flares.filter((f) => f.t <= t);
  const latest = seen.at(-1) ?? null;
  // the status word holds the strongest alert raised in the last 72 h (the model's horizon)
  const recent = seen.filter((f) => f.t > t - storm.meta.horizon_hours * 3_600_000);
  const level: AlertLevel = recent.some((f) => f.alert === 'warning') ? 'warning' : recent.some((f) => f.alert === 'watch') ? 'watch' : 'none';
  const arrived = onsetAt != null && t >= onsetAt;
  // the tally grows with the replay: a storm counts once its particles have arrived
  const reached = prep.onsets.filter((o) => o.t <= t);
  const tally = { hits: reached.filter((o) => o.warned).length, misses: reached.filter((o) => !o.warned).length, fa: seen.filter((f) => f.outcome === 'false-alarm').length };
  const done = t >= END;

  const toggle = () => {
    if (!playing && done) setT(START);
    setPlaying((p) => !p);
  };
  const seek = (next: number) => {
    setPlaying(false);
    setT(next);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const hour = 3_600_000;
    if (e.key === 'ArrowRight') seek(Math.min(END, t + 6 * hour));
    else if (e.key === 'ArrowLeft') seek(Math.max(START, t - 6 * hour));
    else if (e.key === 'Home') seek(START);
    else if (e.key === 'End') seek(END);
    else return;
    e.preventDefault();
  };

  return (
    <div className="rp" data-level={level}>
      {level === 'warning' && (
        <div className="rp-alarm" role="alert">
          <span>{SHELTER}</span>
          {arrived && lead != null && <span className="rp-alarm-lead">Warned {Math.floor(lead)} h before particles arrive (from flare peak)</span>}
        </div>
      )}

      <section className="rp-read brk" aria-live="polite">
        <span className="cap">Storm replay · 5–20 May 2024</span>
        <b className="pat-word rp-word">{WORD[level]}</b>
        <span className="cap rp-line">
          {utc(t)}
          {latest ? ` · ${latest.flareClass} · p ${latest.p.toFixed(2)}` : ' · no flare yet'}
        </span>
        {arrived && lead != null && level !== 'warning' && (
          <span className="cap rp-lead">Warned {Math.floor(lead)} h before particles arrive (from flare peak)</span>
        )}
        <span className="cap rp-score">
          <i className="is-hit" /> {tally.hits} warned <i className="is-miss" /> {tally.misses} missed <i className="is-false-alarm" /> {tally.fa} false {tally.fa === 1 ? 'alarm' : 'alarms'}
        </span>
      </section>

      <Sun flares={seen} latestId={latest?.id ?? null} />

      <div className="rp-bottom">
        <div
          className="rp-track"
          role="slider"
          tabIndex={0}
          aria-label="Replay time"
          aria-valuemin={START}
          aria-valuemax={END}
          aria-valuenow={Math.round(t)}
          aria-valuetext={utc(t)}
          onKeyDown={keys}
        >
          <Timeline prep={prep} t={t} watch={storm.meta.thresholds.watch} warning={storm.meta.thresholds.warning} onSeek={seek} />
          <span className="rp-ticks" aria-hidden>
            {[5, 8, 10, 12, 15, 18, 20].map((d) => (
              <span key={d} style={{ left: `${(xOf(Date.parse(`2024-05-${String(d).padStart(2, '0')}T00:00:00Z`)) / TL.w) * 100}%` }}>
                {d} May
              </span>
            ))}
          </span>
          <span className="rp-th-label is-warning" style={{ bottom: `${pct(storm.meta.thresholds.warning)}%` }}>
            Warning {fmtP(storm.meta.thresholds.warning)}
          </span>
          <span className="rp-th-label is-watch" style={{ bottom: `${pct(storm.meta.thresholds.watch)}%` }}>
            Watch {fmtP(storm.meta.thresholds.watch)}
          </span>
        </div>
        <div className="rp-actions">
          <button type="button" className="solid" onClick={toggle} aria-pressed={playing}>
            {playing ? 'Pause' : done ? 'Replay again' : t > START ? 'Resume' : 'Play'}
          </button>
          <button type="button" className="ghost" onClick={() => seek(START)} disabled={t === START}>
            Restart
          </button>
          <Proof meta={storm.meta} />
        </div>
      </div>
    </div>
  );
}
