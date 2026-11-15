// Environment: radiation, the hazard the crew cannot feel. The Sun as the crew's sensor sees it, every recent flare placed where it
// erupted, the magnetic path from the Sun to the crew, and what the model expects next.
// All numbers come from storm_forecast.json through station/forecast.ts (labels kept: model score,
// estimate from past storms, physics). The model predicts a proton-storm chance, never a dose.
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AlertLevel, FlareEvent } from '../../data/types';
import { classOf, pathOf, PATH_WORD, scan, SHIELD, utc, whatIf, frontHours } from '../forecast';
import type { Status } from '../../data/types';
import { useStationData } from '../model';
import type { ReactNode } from 'react';
import { Btn, roleOf } from '../ds';
import { Bar, Check, Page, SideCap, Vital } from '../frame';
import { useStation } from '../state';
import { cue } from '../ui';

const W = 1000;
const HGT = 640;
const SUN = { x: 300, y: 320, r: 220 };
const CREW = { x: 900, y: 320 };
const D = Math.PI / 180;

const LEVEL_TITLE: Record<AlertLevel, string> = { none: 'Quiet', watch: 'Watch', warning: 'Shelter warning' };
const LEVEL_DO: Record<AlertLevel, string> = {
  none: 'No storm expected. EVA can go ahead as planned.',
  watch: 'Stay within reach of the shelter. Keep EVA short.',
  warning: 'Stop EVA and move to the shelter as a precaution.',
};
const STATUS: Record<AlertLevel, 'green' | 'amber' | 'red'> = { none: 'green', watch: 'amber', warning: 'red' };

/** Orthographic position on the disc as seen from the crew: west to the right. */
function onDisc(lat: number, lon: number) {
  return { x: SUN.x + SUN.r * Math.cos(lat * D) * Math.sin(lon * D), y: SUN.y - SUN.r * Math.sin(lat * D), back: Math.abs(lon) > 90 };
}
const dotR = (flux: number) => Math.max(3, Math.min(14, 3 + (Math.log10(flux) + 6) * 4.2));

export default function Forecast({ replay }: { replay: ReactNode }) {
  const { data, env, doses } = useStationData();
  const setAlarm = useStation((s) => s.setAlarm);
  const alarm = useStation((s) => s.alarm);
  const sound = useStation((s) => s.sound);
  const [mode, setMode] = useState<'forecast' | 'test' | 'replay'>('forecast');
  const test = mode === 'test';
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#replay') setMode('replay');
  }, [hash]);
  const [q, setQ] = useState({ flux: 2e-4, lon: 55, cme: true, kms: 1800 });
  const s = useMemo(() => (data ? scan(data.storm, env) : null), [data, env]);
  const wi = useMemo(() => (data ? whatIf(data.storm, q) : null), [data, q]);
  if (!data || !s) return null;

  const meta = data.storm.meta;
  const mt = meta.metrics_test;
  const limit = data.crew.career_limit_mSv;
  const rate = data.crew.environments[env].dose_mSv_day;
  const place = data.crew.environments[env].label;
  const shield = SHIELD[env];

  // the flare being looked at: the test flare while testing, else the riskiest open flare
  const tPath = pathOf(q.lon, env);
  const focus: { lat: number; lon: number; label: string; level: AlertLevel } | null = test
    ? { lat: 12, lon: q.lon, label: `Test ${classOf(q.flux)} · ${Math.round((wi?.p ?? 0) * 100)}%`, level: wi?.level ?? 'none' }
    : s.top && s.top.latitude_deg != null && s.top.longitude_deg != null
      ? { lat: s.top.latitude_deg, lon: s.top.longitude_deg, label: `${s.top.flare_class} · ${s.top.source_location ?? ''} · ${(s.top.p_storm * 100).toFixed(1)}%`, level: s.top.alert_level }
      : null;
  const flowLevel: AlertLevel = test ? (wi?.level ?? 'none') : s.level;
  const foot = (test ? tPath : s.path)?.foot ?? 60;
  const footPt = onDisc(0, Math.min(89, foot));
  const field = `M ${footPt.x} ${footPt.y} C ${footPt.x + 150} ${footPt.y - 160}, ${CREW.x - 260} ${CREW.y - 120}, ${CREW.x} ${CREW.y}`;
  const particles = flowLevel === 'warning' ? 18 : flowLevel === 'watch' ? 9 : 4;

  const warnCrew = () => {
    if (!wi) return;
    cue('alarm', sound);
    // a model forecast raises Warning only (docs/ARCHITECTURE.md, safety rule)
    setAlarm({ phase: 'warning', flare: classOf(q.flux), p: wi.p, firedAt: Date.now() });
  };

  const st = (l: AlertLevel): Status => STATUS[l];
  const pctTxt = (p: number) => (p * 100 < 1 ? (p * 100).toFixed(1) : String(Math.round(p * 100)));
  const lvl = test && wi ? wi.level : s.level;
  const p = test && wi ? wi.p : s.combined;

  const left = (
    <>
      <Check s={alarm.phase !== 'off' ? 'red' : st(lvl)} title={test ? `Test flare ${classOf(q.flux)}` : 'Storm forecast'} word={alarm.phase !== 'off' ? 'Alarm active' : `${LEVEL_TITLE[lvl]} · ${pctTxt(p)}% in ${meta.horizon_hours} h`} />
      <Check s={(test ? tPath : s.path)?.path === 'direct' && lvl !== 'none' ? 'amber' : 'green'} title="Magnetic path" word={(test ? tPath : s.path) ? PATH_WORD[(test ? tPath : s.path)!.path] : 'No open flare'} />
      <Check s={(test ? q.cme : !!s.front) ? 'amber' : 'green'} title="Eruption front" word={test ? (q.cme ? `Reaches the crew in ~${Math.round(frontHours(q.kms, env))} h` : 'None') : s.front ? `Reaches the crew ~${utc(s.front.at)}` : 'None linked'} />
      <Check s="green" title="Particles would arrive" word={`${Math.round(s.arrival.p25)}–${Math.round(s.arrival.p75)} h after a flare (${s.arrival.n} real storms)`} />
      <Check s={shield.word === 'Strong' ? 'green' : 'amber'} title={`Shielding · ${place}`} word={shield.word} />
      <Check s={st(lvl)} title="What to do" word={alarm.phase !== 'off' ? 'Follow the shelter steps' : LEVEL_DO[lvl]} />
    </>
  );

  const right =
    mode === 'test' ? (
      <>
        <SideCap>Test a flare · if it erupts now</SideCap>
        <div className="ds-field">
          <div className="ds-field-h">
            <b>Size</b>
            <span>{classOf(q.flux)}</span>
          </div>
          <input className="ds-range" type="range" min={-6} max={-3} step={0.05} value={Math.log10(q.flux)} onChange={(e) => setQ({ ...q, flux: 10 ** Number(e.target.value) })} aria-label="Flare size" />
        </div>
        <div className="ds-field">
          <div className="ds-field-h">
            <b>Position</b>
            <span>{q.lon === 0 ? 'centre' : `${Math.abs(q.lon)}° ${q.lon > 0 ? 'west' : 'east'}`}</span>
          </div>
          <input className="ds-range" type="range" min={-90} max={90} step={5} value={q.lon} onChange={(e) => setQ({ ...q, lon: Number(e.target.value) })} aria-label="Position on the Sun" />
        </div>
        <div className="ds-field">
          <div className="ds-field-h">
            <b>Eruption speed</b>
            <span>{q.cme ? `${q.kms} km/s` : 'none'}</span>
          </div>
          <input className="ds-range" type="range" min={0} max={3000} step={50} value={q.cme ? q.kms : 0} onChange={(e) => setQ({ ...q, cme: Number(e.target.value) >= 300, kms: Math.max(300, Number(e.target.value)) })} aria-label="Eruption speed" />
        </div>
        <p className="ds-note">
          Estimated from the {wi?.n} most similar real flares scored by the model; {wi?.storms} of them brought a storm.
        </p>
      </>
    ) : (
      <>
        <SideCap>Radiation now</SideCap>
        <Vital icon="sun" label={`Storm chance, next ${meta.horizon_hours} h`} value={pctTxt(p)} unit="%" s={st(lvl)} history={s.month.map((e) => ({ v: e.p_storm, flag: e.alert_level === 'none' ? null : st(e.alert_level) }))} note={`Each bar is a flare in the last 30 days, scored by the model`} />
        <Vital icon="dose" label={`Dose rate · ${place}`} value={rate} unit="mSv/day" s={rate > 1 ? 'amber' : 'green'} range={{ min: 0, max: 2, v: rate }} note={`Shielding: ${shield.word.toLowerCase()}`} />
        <SideCap>Career dose · limit {limit} mSv</SideCap>
        {doses.map(({ v, d }) => (
          <Bar key={v.m.id} label={roleOf(v.m)} value={`${(((d.cumulative_mSv ?? 0) / limit) * 100).toFixed(1)}%`} frac={(d.cumulative_mSv ?? 0) / limit} s={(d.cumulative_mSv ?? 0) / limit > 0.5 ? 'amber' : 'green'} />
        ))}
        <SideCap>Model on unseen {meta.test_period[0].slice(0, 4)}–{meta.test_period[1].slice(0, 4)}</SideCap>
        <Bar label="Storms warned" value={`${Math.round(mt.hit_rate * mt.n_storms)} / ${mt.n_storms}`} frac={mt.hit_rate} note={`~${mt.false_alarms_per_month.toFixed(0)} false alarm a month · median warning ${mt.median_lead_time_h.toFixed(1)} h`} />
      </>
    );

  const sun = (
        <svg viewBox={`0 0 ${W} ${HGT}`} className="fc-svg" role="img" aria-label="Sun scan with recent flares and the magnetic path to the crew">
          <defs>
            <radialGradient id="fc-sun" cx="46%" cy="44%" r="60%">
              <stop offset="0" stopColor="#fff4d6" />
              <stop offset="0.45" stopColor="#ffc46b" />
              <stop offset="0.85" stopColor="#ff7a2a" />
              <stop offset="1" stopColor="#c43d10" />
            </radialGradient>
            <radialGradient id="fc-corona">
              <stop offset="0.55" stopColor="#ffb05a" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ffb05a" stopOpacity="0" />
            </radialGradient>
            <filter id="fc-gran" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7">
                <animate attributeName="baseFrequency" dur="18s" values="0.035;0.041;0.035" repeatCount="indefinite" />
              </feTurbulence>
              <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.55  0 0 0 0 0.15  0 0 0 0.55 0" />
              <feComposite in2="SourceGraphic" operator="in" />
              <feBlend in="SourceGraphic" mode="multiply" />
            </filter>
            <linearGradient id="fc-sweep" x1="0" x2="1">
              <stop offset="0" stopColor="#7ee2ff" stopOpacity="0" />
              <stop offset="1" stopColor="#7ee2ff" stopOpacity="0.5" />
            </linearGradient>
            <path id="fc-field" d={field} />
          </defs>

          {/* corona and disc */}
          <circle cx={SUN.x} cy={SUN.y} r={SUN.r * 1.55} fill="url(#fc-corona)" className="fc-corona" />
          <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#fc-sun)" filter="url(#fc-gran)" />
          {/* heliographic grid */}
          <g className="fc-grid">
            {[-60, -30, 0, 30, 60].map((lon) => (
              <ellipse key={lon} cx={SUN.x} cy={SUN.y} rx={Math.abs(SUN.r * Math.sin(lon * D)) || 0.5} ry={SUN.r} />
            ))}
            {[-60, -30, 0, 30, 60].map((lat) => (
              <line key={lat} x1={SUN.x - SUN.r * Math.cos(lat * D)} x2={SUN.x + SUN.r * Math.cos(lat * D)} y1={SUN.y - SUN.r * Math.sin(lat * D)} y2={SUN.y - SUN.r * Math.sin(lat * D)} />
            ))}
          </g>
          {/* the band of the Sun wired to the crew (Parker spiral footpoint +/- 30 deg) */}
          {(() => {
            // the band between the meridians foot-30 and foot+30 (capped at the limb), on the visible disc
            const a = Math.max(-89, foot - 30);
            const b = Math.min(90, foot + 30);
            const rx = (l: number) => Math.max(0.5, Math.abs(SUN.r * Math.sin(l * D)));
            const side = (l: number) => (l >= 0 ? 1 : 0);
            return <path className="fc-band" d={`M ${SUN.x} ${SUN.y - SUN.r} A ${rx(a)} ${SUN.r} 0 0 ${side(a)} ${SUN.x} ${SUN.y + SUN.r} A ${rx(b)} ${SUN.r} 0 0 ${1 - side(b)} ${SUN.x} ${SUN.y - SUN.r} Z`} />;
          })()}
          <text x={SUN.x + SUN.r * 0.62} y={SUN.y - SUN.r - 14} className="fc-svg-cap">
            wired to the crew
          </text>

          {/* flares of the last 30 days; open ones pulse */}
          {s.month.map((e: FlareEvent) => {
            if (e.latitude_deg == null || e.longitude_deg == null) return null;
            const p = onDisc(e.latitude_deg, e.longitude_deg);
            if (p.back) return null;
            const open = s.open.includes(e);
            return (
              <g key={e.flare_id} className={`fc-flare is-${STATUS[e.alert_level]}${open ? ' is-open' : ''}`}>
                <circle cx={p.x} cy={p.y} r={dotR(e.class_flux)} />
                {open && <circle cx={p.x} cy={p.y} r={dotR(e.class_flux)} className="fc-ping" />}
              </g>
            );
          })}

          {/* scan sweep */}
          <g className="fc-sweep" style={{ transformOrigin: `${SUN.x}px ${SUN.y}px` }}>
            <path d={`M ${SUN.x} ${SUN.y} L ${SUN.x + SUN.r + 26} ${SUN.y} A ${SUN.r + 26} ${SUN.r + 26} 0 0 0 ${SUN.x + (SUN.r + 26) * Math.cos(28 * D)} ${SUN.y - (SUN.r + 26) * Math.sin(28 * D)} Z`} fill="url(#fc-sweep)" opacity="0.16" />
          </g>
          <circle cx={SUN.x} cy={SUN.y} r={SUN.r + 26} className="fc-ring" />
          <circle cx={SUN.x} cy={SUN.y} r={SUN.r + 40} className="fc-ring is-ticks" />

          {/* focus reticle */}
          {focus &&
            (() => {
              const p = onDisc(focus.lat, focus.lon);
              const k = 20;
              return (
                <g className={`fc-reticle is-${STATUS[focus.level]}`}>
                  <path d={`M ${p.x - k} ${p.y - k + 8} v -8 h 8 M ${p.x + k - 8} ${p.y - k} h 8 v 8 M ${p.x + k} ${p.y + k - 8} v 8 h -8 M ${p.x - k + 8} ${p.y + k} h -8 v -8`} />
                  {test && <circle cx={p.x} cy={p.y} r={dotR(q.flux)} className="fc-testdot" />}
                  <line x1={p.x + k} y1={p.y - k} x2={p.x + 70} y2={p.y - 70} />
                  <text x={p.x + 76} y={p.y - 74}>
                    {focus.label}
                  </text>
                </g>
              );
            })()}

          {/* magnetic path and particles to the crew */}
          <use href="#fc-field" className={`fc-field is-${STATUS[flowLevel]}`} />
          {Array.from({ length: particles }, (_, i) => (
            <circle key={`${flowLevel}-${i}`} r={flowLevel === 'none' ? 1.6 : 2.6} className={`fc-particle is-${STATUS[flowLevel]}`}>
              <animateMotion dur={`${flowLevel === 'warning' ? 2.2 : 4.5}s`} begin={`${(i * (flowLevel === 'warning' ? 2.2 : 4.5)) / particles}s`} repeatCount="indefinite">
                <mpath href="#fc-field" />
              </animateMotion>
            </circle>
          ))}
          <g className="fc-crew">
            <circle cx={CREW.x} cy={CREW.y} r="30" className="fc-crew-halo" />
            <circle cx={CREW.x} cy={CREW.y} r="9" />
            <text x={CREW.x} y={CREW.y + 54} textAnchor="middle">
              Crew · {place}
            </text>
            <text x={CREW.x} y={CREW.y + 76} textAnchor="middle" className="fc-svg-cap">
              shielding: {shield.word.toLowerCase()}
            </text>
          </g>

          {/* HUD readouts */}
          <g className="fc-hud">
            <text x="24" y="34">
              SCAN {utc(s.at).toUpperCase()}
            </text>
            <text x="24" y="58">
              FLARES 30 D · {s.month.length}
            </text>
            <text x="24" y="82">
              OPEN {meta.horizon_hours} H WINDOW · {s.open.length}
            </text>
            <text x={W - 24} y="34" textAnchor="end">
              NASA DONKI · RECORDED
            </text>
            <text x={W - 24} y="58" textAnchor="end">
              MODEL {meta.model.replace('_', ' ').toUpperCase()}
            </text>
          </g>
        </svg>
  );

  return (
    <Page
      className={mode === 'replay' ? 'is-replay' : ''}
      title="Environment"
      sub={mode === 'replay' ? 'May 2024 superstorm · the model never saw 2024' : `Radiation · scan ${utc(s.at)} · NASA DONKI, recorded`}
      left={left}
      object={mode === 'replay' ? <div className="fr-replay">{replay}</div> : sun}
      right={mode === 'replay' ? undefined : right}
      footLeft={
        <div className="fr-seg" role="tablist" aria-label="View">
          {(
            [
              ['forecast', 'Forecast'],
              ['test', 'Test a flare'],
              ['replay', 'Replay 2024'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'is-on' : ''} onClick={() => (cue('tick', sound), setMode(k))}>
              {label}
            </button>
          ))}
        </div>
      }
      footRight={
        alarm.phase === 'warning' || alarm.phase === 'sheltered' ? (
          // a forecast warning can be stood down; a measured storm (arrived) cannot be cleared here
          <Btn onClick={() => setAlarm({ phase: 'off' })}>Stand down</Btn>
        ) : test && wi?.level === 'warning' ? (
          <Btn kind="danger" onClick={warnCrew}>
            Warn the crew
          </Btn>
        ) : null
      }
    />
  );
}
