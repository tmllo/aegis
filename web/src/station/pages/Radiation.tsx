// Radiation: space weather now, dose per crew against the career limit, the model's held-out scorecard,
// the live forecast feed, and the May 2024 replay that drives the station-wide shelter alarm.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EnvironmentId, StormForecast } from '../../data/types';
import { prepare, flareRadius, type Flare, type Prepared } from '../../console/replay/StormReplay';
import { LEVEL_STATUS, LEVEL_WORD, firstName, fmtV, seatOf, useStationData } from '../model';
import { useStation } from '../state';
import { Card, Chip, cue, Dot, Icon, STATUS_COLOR } from '../ui';

const START = Date.parse('2024-05-05T00:00:00Z');
const END = Date.parse('2024-05-20T23:59:00Z');
const PLAY_MS = 42_000;
const H = 3600e3;

const utc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} May ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};

export default function Radiation() {
  const { data, sw, doses, env, setEnv } = useStationData();
  if (!data || !sw) return null;
  const meta = data.storm.meta;
  const mt = meta.metrics_test;
  const limit = data.crew.career_limit_mSv;
  const envs = Object.keys(data.crew.environments) as EnvironmentId[];
  const maxEnv = Math.max(...envs.map((e) => data.crew.environments[e].dose_mSv_day));
  const cum = Math.max(...doses.map((d) => d.d.cumulative_mSv ?? 0));

  return (
    <div className="st-page st-radpage">
      <Replay storm={data.storm} />

      <div className="st-rad-top">
        <Card title="Space weather now" right={<Chip s={LEVEL_STATUS[sw.level]} solid={sw.level !== 'none'}>{LEVEL_WORD[sw.level]}</Chip>}>
          <div className="st-swnow">
            <div className={`st-big is-${LEVEL_STATUS[sw.level]}`}>
              {Math.round(sw.p * 100)}
              <small>%</small>
            </div>
            <div>
              <p>Chance of a solar radiation storm in the next {meta.horizon_hours} h</p>
              <p className="st-muted st-small">
                Latest flare {sw.latest?.flare_class} at {sw.latest?.source_location ?? 'unknown location'} · {sw.latest ? new Date(sw.latest.peak_time).toUTCString().slice(5, 22) : ''} UTC
              </p>
            </div>
          </div>
          <div className="st-thresh">
            <span>
              <Dot s="amber" size={8} /> Watch ≥ {(meta.thresholds.watch * 100).toFixed(0)}%
            </span>
            <span>
              <Dot s="red" size={8} /> Shelter warning ≥ {(meta.thresholds.warning * 100).toFixed(0)}%
            </span>
          </div>
        </Card>

        <Card title="Crew dose vs career limit" right={<span className="st-muted">{limit} mSv NASA limit</span>}>
          <div className="st-dosebars is-big">
            {doses.map(({ v, d }) => (
              <div key={v.m.id}>
                <span>
                  {seatOf(v.m)} · {firstName(v.m)}
                </span>
                <div className="st-bar">
                  <i style={{ width: `${((d.cumulative_mSv ?? 0) / limit) * 100}%` }} />
                </div>
                <b>
                  {fmtV('dose_mSv_cum', d.cumulative_mSv)} <small>mSv</small>
                </b>
              </div>
            ))}
          </div>
          <div className="st-envs">
            {envs.map((e) => {
              const r = data.crew.environments[e].dose_mSv_day;
              const days = Math.round((limit - cum) / r);
              return (
                <button key={e} className={e === env ? 'is-on' : ''} onClick={() => setEnv(e)}>
                  <span>{data.crew.environments[e].label}</span>
                  <i style={{ height: `${(r / maxEnv) * 34 + 4}px` }} />
                  <b>{r} mSv/d</b>
                  <em>~{days} d to limit</em>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Forecast model · held-out test" right={<span className="st-muted">{meta.test_period[0].slice(0, 4)}–{meta.test_period[1].slice(0, 4)}</span>}>
          <div className="st-scores">
            <div>
              <b>
                {Math.round(mt.hit_rate * mt.n_storms)}/{mt.n_storms}
              </b>
              <span>storms warned</span>
            </div>
            <div>
              <b>{mt.false_alarms_per_month.toFixed(1)}</b>
              <span>false alarms / month</span>
            </div>
            <div>
              <b>{mt.median_lead_time_h.toFixed(1)} h</b>
              <span>median warning time</span>
            </div>
            <div>
              <b>+{Math.round(mt.brier_skill_vs_climatology * 100)}%</b>
              <span>skill vs climatology</span>
            </div>
          </div>
          <p className="st-muted st-small">
            Trained on {meta.train_period[0].slice(0, 4)}–{meta.train_period[1].slice(0, 4)} NASA DONKI flares, CMEs and SEP events ({meta.model.replace('_', ' ')}). Scored once on {mt.n_flares.toLocaleString()} unseen flares. Top signals: CME speed, flare longitude, flare class.
          </p>
        </Card>
      </div>


      <Card title="Forecast feed" right={<span className="st-muted">latest flares, newest first</span>} className="st-feed">
        <table>
          <thead>
            <tr>
              <th>Peak (UTC)</th>
              <th>Class</th>
              <th>Location</th>
              <th>CME</th>
              <th>Storm chance, {meta.horizon_hours} h</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {sw.recent.slice(0, 8).map((e) => (
              <tr key={e.flare_id}>
                <td className="st-num">{e.peak_time.slice(0, 16).replace('T', ' ')}</td>
                <td>
                  <b>{e.flare_class}</b>
                </td>
                <td>{e.source_location ?? '—'}</td>
                <td>{e.has_linked_cme ? `${e.cme_speed_kms ?? '?'} km/s` : '—'}</td>
                <td>
                  <div className="st-pbar">
                    <i style={{ width: `${Math.min(100, Math.sqrt(e.p_storm) * 100)}%`, background: STATUS_COLOR[LEVEL_STATUS[e.alert_level]] }} />
                    <span>{(e.p_storm * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td>
                  <Chip s={LEVEL_STATUS[e.alert_level]}>{LEVEL_WORD[e.alert_level]}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ replay */

interface Episode {
  start: Flare;
  onset: number | null;
  /** end of the warning: onset + 18 h, or horizon after the last warning flare */
  end: number;
  lead: number | null;
}

function episodes(prep: Prepared, horizonH: number): Episode[] {
  const out: Episode[] = [];
  for (const f of prep.flares) {
    if (f.alert !== 'warning') continue;
    const cur = out[out.length - 1];
    if (cur && f.t <= cur.end) {
      if (!cur.onset && f.onset) cur.onset = f.onset;
      cur.end = Math.max(cur.end, cur.onset ? cur.onset + 18 * H : f.t + horizonH * H);
      continue;
    }
    const onset = f.onset;
    out.push({ start: f, onset, end: onset ? onset + 18 * H : f.t + horizonH * H, lead: f.lead });
  }
  return out;
}

function Replay({ storm }: { storm: StormForecast }) {
  const prep = useMemo(() => prepare(storm), [storm]);
  const eps = useMemo(() => episodes(prep, storm.meta.horizon_hours), [prep, storm.meta.horizon_hours]);
  const [t, setT] = useState(START);
  const [playing, setPlaying] = useState(false);
  const [arrived, setArrived] = useState<Episode | null>(null);
  const alarm = useStation((s) => s.alarm);
  const setAlarm = useStation((s) => s.setAlarm);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const fired = useRef(new Set<number>());
  const landed = useRef(new Set<number>());
  const cleared = useRef(new Set<number>());
  const tRef = useRef(t);
  tRef.current = t;

  const reset = useCallback(() => {
    fired.current.clear();
    landed.current.clear();
    cleared.current.clear();
    setArrived(null);
    setAlarm({ phase: 'off' });
    setT(START);
  }, [setAlarm]);

  // stop the alarm when the page is left after a finished replay
  useEffect(() => () => void (tRef.current >= END && useStation.getState().setAlarm({ phase: 'off' })), []);

  // the clock; pauses while the shelter dialog waits for the crew
  const waiting = alarm.phase === 'warning';
  useEffect(() => {
    if (!playing || waiting) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((x) => {
        const n = Math.min(END, x + (dt / PLAY_MS) * (END - START));
        if (n >= END) setPlaying(false);
        return n;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, waiting]);

  // events at the current time
  useEffect(() => {
    eps.forEach((e, i) => {
      if (t >= e.start.t && !fired.current.has(i)) {
        fired.current.add(i);
        cue('alarm', sound);
        // the first warning stops the clock and asks the crew to confirm; later ones go straight to shelter
        setAlarm({ phase: i === 0 ? 'warning' : 'sheltered', flare: e.start.flareClass, p: e.start.p, firedAt: e.start.t });
        if (i > 0) toast({ tone: 'red', title: `Storm warning · flare ${e.start.flareClass}`, body: `Storm chance ${Math.round(e.start.p * 100)}%. Crew moved to shelter.` });
      }
      if (e.onset && t >= e.onset && !landed.current.has(i)) {
        landed.current.add(i);
        cue('arrive', sound);
        setArrived(e);
        window.setTimeout(() => setArrived((a) => (a === e ? null : a)), 5200);
      }
      if (t >= e.end && !cleared.current.has(i) && fired.current.has(i)) {
        cleared.current.add(i);
        setAlarm({ phase: 'off' });
        toast(e.onset ? { tone: 'green', title: 'All clear', body: 'Particle flux back to background. EVA can resume.' } : { tone: 'amber', title: 'Warning expired · no storm', body: 'A false alarm, shown honestly: about one a month on the test period.' });
      }
    });
    // storms nobody warned about
    prep.onsets.forEach((o) => {
      if (!o.warned && t >= o.t && !landed.current.has(-o.t)) {
        landed.current.add(-o.t);
        toast({ tone: 'amber', title: 'Storm missed', body: 'Particles arrived without a warning.' });
      }
    });
  }, [t, eps, prep.onsets, sound, setAlarm, toast]);

  const seen = prep.flares.filter((f) => f.t <= t);
  const lastF = seen[seen.length - 1] ?? null;
  // risk now: highest storm chance among flares in the last 24 h
  const pNow = seen.filter((f) => f.t > t - 24 * H).reduce((a, f) => Math.max(a, f.p), 0);
  const th = storm.meta.thresholds;
  const level = pNow >= th.warning ? 'warning' : pNow >= th.watch ? 'watch' : 'none';
  const inStorm = eps.some((e) => e.onset && t >= e.onset && t < e.end);
  const warnedSoFar = eps.filter((e) => e.onset && t >= e.onset).length;
  const falseSoFar = eps.filter((e) => !e.onset && t >= e.end).length;
  const missedSoFar = prep.onsets.filter((o) => !o.warned && t >= o.t).length;
  const started = t > START || playing;
  const first = eps[0];

  return (
    <section className={`st-replay${inStorm ? ' is-storm' : ''}`}>
      <header className="st-replay-h">
        <div>
          <p className="st-cap">Replay · held-out test data · the model never saw 2024</p>
          <h3>May 2024 solar superstorm</h3>
        </div>
        <div className="st-replay-ctl">
          <button
            className="st-btn is-primary"
            onClick={() => {
              if (t >= END) reset();
              setPlaying((p) => !p);
              cue('tick', sound);
            }}
          >
            {playing ? <Icon.pause /> : <Icon.play />} {playing ? 'Pause' : t >= END ? 'Replay again' : started ? 'Resume' : 'Play replay'}
          </button>
          <button
            className="st-btn is-ghost"
            onClick={() => {
              setPlaying(false);
              reset();
            }}
          >
            Restart
          </button>
        </div>
      </header>

      <div className="st-replay-body">
        <div className="st-replay-read">
          <p className="st-replay-clock">{utc(t)}</p>
          <p className={`st-word is-${inStorm ? 'red' : LEVEL_STATUS[level]}`}>{inStorm ? 'Particles arriving' : LEVEL_WORD[level]}</p>
          <p className="st-replay-line">{lastF ? `Latest flare ${lastF.flareClass} · storm chance ${(lastF.p * 100).toFixed(1)}%` : 'No flares yet. Press play.'}</p>
          <div className="st-gauge">
            <div className="st-gauge-track">
              <i className="w" style={{ left: `${Math.sqrt(th.watch) * 100}%` }} />
              <i className="r" style={{ left: `${Math.sqrt(th.warning) * 100}%` }} />
              <b style={{ width: `${Math.sqrt(pNow) * 100}%`, background: STATUS_COLOR[LEVEL_STATUS[level]] }} />
            </div>
            <span>storm chance now · {Math.round(pNow * 100)}%</span>
          </div>
          <div className="st-tally">
            <span>
              <Dot s="green" size={8} /> {warnedSoFar} storms warned
            </span>
            <span>
              <Dot s="amber" size={8} /> {falseSoFar} false alarm{falseSoFar === 1 ? '' : 's'}
            </span>
            <span>
              <Dot s="red" size={8} /> {missedSoFar} missed
            </span>
          </div>
          {!started && first && (
            <p className="st-replay-teaser">
              Press play: 16 days of real flares in 40 seconds. Watch for the shelter warning on {utc(first.start.t).replace(' UTC', '')}, then the particles {first.lead?.toFixed(0)} hours later.
            </p>
          )}
        </div>
        <SunDisc flares={seen} latest={lastF?.id ?? null} storm={inStorm} />
        {arrived && (
          <div className="st-arrived">
            <p className="st-cap">Particles arrived · {utc(arrived.onset!)}</p>
            <h4>
              Crew warned <b>{arrived.lead?.toFixed(1)} h</b> before arrival
            </h4>
            <p>Shelter order went out at {utc(arrived.start.t)} from flare {arrived.start.flareClass}.</p>
          </div>
        )}
      </div>

      <Timeline prep={prep} eps={eps} t={t} th={th} onSeek={(x) => setT(x)} />
    </section>
  );
}

function SunDisc({ flares, latest, storm }: { flares: Flare[]; latest: string | null; storm: boolean }) {
  const R = 150;
  const dots = flares
    .map((f) => {
      if (f.lat == null || f.lon == null) return null;
      const la = (f.lat * Math.PI) / 180;
      const lo = (f.lon * Math.PI) / 180;
      if (Math.cos(la) * Math.cos(lo) < 0) return null;
      return { f, x: R * Math.cos(la) * Math.sin(lo), y: -R * Math.sin(la) };
    })
    .filter((d): d is { f: Flare; x: number; y: number } => !!d);
  return (
    <div className={`st-sun${storm ? ' is-storm' : ''}`}>
      <svg viewBox="-200 -200 400 400" role="img" aria-label="The Sun seen from Earth with each flare at its position">
        <defs>
          <radialGradient id="st-sun-g" cx="45%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#fff4d8" />
            <stop offset="50%" stopColor="#f7b459" />
            <stop offset="100%" stopColor="#b0461a" />
          </radialGradient>
          <radialGradient id="st-sun-glow">
            <stop offset="60%" stopColor="#f6a24a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f6a24a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r={R + 46} fill="url(#st-sun-glow)" />
        <circle r={R} fill="url(#st-sun-g)" />
        {[-60, -30, 0, 30, 60].map((la) => {
          const y = -R * Math.sin((la * Math.PI) / 180);
          const w = R * Math.cos((la * Math.PI) / 180);
          return <line key={la} x1={-w} x2={w} y1={y} y2={y} stroke="#3a1606" strokeOpacity={0.14} />;
        })}
        {dots.map(({ f, x, y }) => (
          <g key={f.id} className={`st-flare is-${f.alert}${f.id === latest ? ' is-latest' : ''}`}>
            <circle cx={x} cy={y} r={flareRadius(f.flareClass)} />
          </g>
        ))}
        <text x={-R - 14} y={4} textAnchor="end" className="st-axis">
          East
        </text>
        <text x={R + 14} y={4} className="st-axis">
          West → Earth-connected
        </text>
      </svg>
    </div>
  );
}

function Timeline({ prep, eps, t, th, onSeek }: { prep: Prepared; eps: Episode[]; t: number; th: { watch: number; warning: number }; onSeek: (t: number) => void }) {
  const W = 1200;
  const Hh = 150;
  const top = 12;
  const bottom = 122;
  const x = (ms: number) => ((ms - START) / (END - START)) * W;
  const y = (p: number) => bottom - Math.sqrt(Math.max(0, Math.min(1, p))) * (bottom - top);
  const ref = useRef<SVGSVGElement>(null);
  const seek = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onSeek(START + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (END - START));
  };
  const days = Array.from({ length: 16 }, (_, i) => START + i * 24 * H);
  return (
    <svg ref={ref} className="st-tl" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" onPointerDown={(e) => seek(e.clientX)}>
      {eps.map((e, i) => (
        <rect key={i} x={x(e.start.t)} y={top} width={Math.max(2, x(Math.min(e.end, END)) - x(e.start.t))} height={bottom - top} className={e.onset ? 'st-tl-ep' : 'st-tl-ep is-false'} />
      ))}
      <line x1={0} x2={W} y1={y(th.warning)} y2={y(th.warning)} className="st-tl-warn" />
      <line x1={0} x2={W} y1={y(th.watch)} y2={y(th.watch)} className="st-tl-watch" />
      <text x={W - 6} y={y(th.warning) - 5} textAnchor="end" className="st-axis is-red">
        shelter warning
      </text>
      <text x={W - 6} y={y(th.watch) - 5} textAnchor="end" className="st-axis is-amber">
        watch
      </text>
      {prep.onsets.map((o) => (
        <g key={o.t}>
          <line x1={x(o.t)} x2={x(o.t)} y1={top} y2={bottom} className={o.warned ? 'st-tl-onset' : 'st-tl-onset is-miss'} />
          <text x={x(o.t) + 4} y={top + 10} className="st-axis">
            particles arrive
          </text>
        </g>
      ))}
      {prep.flares.map((f) => (
        <line key={f.id} x1={x(f.t)} x2={x(f.t)} y1={bottom} y2={y(f.p)} className={`st-tl-f is-${f.alert}${f.t > t ? ' is-future' : ''}`} />
      ))}
      <rect x={x(t)} y={0} width={W - x(t)} height={bottom} className="st-tl-fog" />
      <line x1={x(t)} x2={x(t)} y1={0} y2={bottom + 4} className="st-tl-now" />
      {days.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d} x={x(d)} y={Hh - 8} className="st-axis">
            {new Date(d).getUTCDate()} May
          </text>
        ) : null,
      )}
    </svg>
  );
}
