// Environment: radiation, the hazard the crew cannot feel. The Sun as the crew's sensor sees it, every recent flare placed where it
// erupted, the magnetic path from the Sun to the crew, and what the model expects next.
// All numbers come from storm_forecast.json through station/forecast.ts (labels kept: model score,
// estimate from past storms, physics). The model predicts a proton-storm chance, never a dose.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AlertLevel, FlareEvent } from '../../data/types';
import { classOf, pathOf, scan, SHIELD, utc, whatIf } from '../forecast';
import type { Status } from '../../data/types';
import { useStationData } from '../model';
import type { ReactNode } from 'react';
import { Btn, roleOf } from '../ds';
import { Bar, Check, Page, SideCap, Vital } from '../frame';
import { useStation } from '../state';
import { cue } from '../ui';
import type { SunFlare } from '../SunScene';

const SunScene = lazy(() => import('../SunScene'));


const LEVEL_TITLE: Record<AlertLevel, string> = { none: 'Quiet', watch: 'Watch', warning: 'Shelter warning' };
const LEVEL_DO: Record<AlertLevel, string> = {
  none: 'No storm expected. EVA can go ahead as planned.',
  watch: 'Stay within reach of the shelter. Keep EVA short.',
  warning: 'Stop EVA and move to the shelter as a precaution.',
};
const STATUS: Record<AlertLevel, 'green' | 'amber' | 'red'> = { none: 'green', watch: 'amber', warning: 'red' };


export default function Forecast({ replay }: { replay: ReactNode }) {
  const { data, env, doses } = useStationData();
  const setAlarm = useStation((s) => s.setAlarm);
  const alarm = useStation((s) => s.alarm);
  const sound = useStation((s) => s.sound);
  const me = useStation((s) => s.me);
  const medic = me === 'medic';
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
      ? { lat: s.top.latitude_deg, lon: s.top.longitude_deg, label: `${s.top.flare_class} flare · ${(s.top.p_storm * 100).toFixed(1)}% storm chance`, level: s.top.alert_level }
      : null;
  const flowLevel: AlertLevel = test ? (wi?.level ?? 'none') : s.level;
  const foot = (test ? tPath : s.path)?.foot ?? 60;
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
        <SideCap>{medic ? 'Career dose' : 'My career dose'} · limit {limit} mSv</SideCap>
        {doses.filter(({ v }) => medic || v.m.id === me).map(({ v, d }) => (
          <Bar key={v.m.id} label={roleOf(v.m)} value={`${(((d.cumulative_mSv ?? 0) / limit) * 100).toFixed(1)}%`} frac={(d.cumulative_mSv ?? 0) / limit} s={(d.cumulative_mSv ?? 0) / limit > 0.5 ? 'amber' : 'green'} />
        ))}
        <SideCap>Model on unseen {meta.test_period[0].slice(0, 4)}–{meta.test_period[1].slice(0, 4)}</SideCap>
        <Bar label="Storms warned" value={`${Math.round(mt.hit_rate * mt.n_storms)} / ${mt.n_storms}`} frac={mt.hit_rate} note={`~${mt.false_alarms_per_month.toFixed(0)} false alarm a month · median warning ${mt.median_lead_time_h.toFixed(1)} h`} />
      </>
    );

  // the Sun in real space (3D, lazy): flares at their heliographic positions, the field line, the crew
  const flares: SunFlare[] = s.month
    .filter((e: FlareEvent) => e.latitude_deg != null && e.longitude_deg != null && Math.abs(e.longitude_deg) <= 90)
    .map((e: FlareEvent) => ({ id: e.flare_id, lat: e.latitude_deg!, lon: e.longitude_deg!, flux: e.class_flux, level: e.alert_level, open: s.open.includes(e) }));
  if (test) flares.push({ id: 'test', lat: 12, lon: q.lon, flux: q.flux, level: wi?.level ?? 'none', open: true });
  const sun = (
    <Suspense fallback={<div className="sun3d" />}>
      <SunScene flares={flares} focus={focus} foot={foot} level={flowLevel} particles={particles} place={place} shield={shield.word.toLowerCase()} alarm={alarm.phase !== 'off'} />
    </Suspense>
  );

  return (
    <Page
      className={mode === 'replay' ? 'is-replay' : ''}
      title="Radiation"
      sub={mode === 'replay' ? 'May 2024 superstorm · the model never saw 2024' : `Solar storm forecast · NASA DONKI data, recorded ${utc(s.at)}`}
      left={left}
      object={mode === 'replay' ? <div className="fr-replay">{replay}</div> : sun}
      right={mode === 'replay' ? undefined : right}
      footLeft={
        <div className="fr-seg" role="tablist" aria-label="View">
          {(
            [
              ['forecast', 'Forecast'],
              ['test', 'Test'],
              ['replay', 'Replay'],
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
