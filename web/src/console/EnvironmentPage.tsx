// CABIN: what the crew is exposed to, around the live globe. Left: cabin air and water (the
// recorded ISS snapshot) and radiation on the body (cumulative dose vs the career limit, the
// sensitive tissues lit). Right: the storm forecast from our model, its test scores, and the
// May 2024 replay and shelter drill. Every number from the data files, core or the cabin feed.
import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { cabinOverall } from '../core/cabin';
import { DOSE_CUM_AMBER_FRACTION } from '../core/scoring';
import { doseSummary, sortedEvents } from '../core/radiation';
import type { Status } from '../data/types';
import { fmtDate, PLACE, STATUS_WORD } from './model';
import { Icon } from './ui';
import { StormChart } from './StormChart';
import ReplayPage from './ReplayPage';
import ShelterPage from './ShelterPage';
import { useConsole } from './useConsole';

// the forecast screen (weather map of where the radiation comes from and goes) is built by session ab
// in ./weather; the glob keeps the build passing until that file lands, and hides the button meanwhile
const forecastMod = import.meta.glob<{ default: ComponentType }>('./weather/Forecast.tsx')['./weather/Forecast.tsx'];
const ForecastPage = forecastMod ? lazy(forecastMod) : null;

const AIR = [
  { key: 'cabin.ppco2', label: 'Carbon dioxide' },
  { key: 'cabin.ppo2', label: 'oxygen' },
  { key: 'cabin.pressure', label: 'air pressure' },
  { key: 'cabin.temp', label: '' },
];
const TANK: Record<string, string> = { 'cabin.water_clean': 'drinking water', 'cabin.water_waste': 'waste water', 'cabin.urine_tank': 'urine' };
const LEVEL: Record<string, Status> = { none: 'green', watch: 'amber', warning: 'red' };
const COL: Record<Status, string> = { green: 'rgb(var(--accent))', amber: 'rgb(var(--warn))', red: 'rgb(var(--crit))' };

/** A simple body figure with the radiation-sensitive tissues lit by the dose fraction. */
function DoseBody({ status, f }: { status: Status; f: number }) {
  const c = COL[status];
  const o = 0.35 + Math.min(1, f) * 0.65;
  return (
    <svg viewBox="0 0 120 220" className="dose-body" aria-hidden>
      {/* skin: the outline */}
      <path d="M60 8a16 16 0 1 1 0 32a16 16 0 1 1 0-32ZM42 46h36l10 58-8 2-6-40v54l6 86h-12l-8-80-8 80H40l6-86V66l-6 40-8-2Z" fill="none" stroke={c} strokeOpacity={o} strokeWidth="1.5" />
      {/* CNS */}
      <ellipse cx="60" cy="22" rx="9" ry="7" fill={c} fillOpacity={o * 0.8} />
      {/* eye lens */}
      <circle cx="54.5" cy="28" r="1.8" fill="#fff" />
      <circle cx="65.5" cy="28" r="1.8" fill="#fff" />
      {/* blood-forming marrow: spine, pelvis, femurs */}
      <path d="M60 48v62M48 112h24M52 116l-2 70M68 116l2 70" stroke={c} strokeOpacity={o} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function EnvironmentPage() {
  const { data, cd, cv, seat } = useConsole();
  const { cabin } = useCabin();
  const [params, setParams] = useSearchParams();
  const [more, setMore] = useState<'air' | 'sky' | null>(null);
  const events = useMemo(() => (data ? sortedEvents(data.storm).slice(-60) : []), [data]);
  const mode = params.get('mode');
  if (mode === 'replay' || mode === 'shelter' || (mode === 'forecast' && ForecastPage))
    return (
      <>
        <button type="button" className="ghost env-back" onClick={() => setParams({}, { replace: true })}>
          <Icon name="back" size={14} /> Cabin
        </button>
        {mode === 'replay' ? (
          <ReplayPage />
        ) : mode === 'shelter' ? (
          <ShelterPage />
        ) : ForecastPage ? (
          <Suspense fallback={<p className="cx-error cx-wait">Loading</p>}>
            <ForecastPage />
          </Suspense>
        ) : null}
      </>
    );
  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const air = cabin ? cabinOverall(cabin.readings) : null;
  const live = cabin?.readings.some((r) => r.quality === 'live');
  const recAt = cabin?.readings.find((r) => r.t != null)?.t;
  const tanks = cabin?.readings.filter((r) => r.metric.tank) ?? [];
  const latest = events.at(-1);
  const storm = latest ? LEVEL[latest.alert_level] : null;
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const f = dose.fraction ?? 0;
  const doseStatus: Status = f >= 1 ? 'red' : f >= DOSE_CUM_AMBER_FRACTION ? 'amber' : 'green';
  const m = data.storm.meta.metrics_test;
  const caught = Math.round(m.hit_rate * m.n_storms);

  const level = latest?.alert_level ?? null;
  const offAir = cabin?.readings.filter((r) => !r.metric.tank && r.status && r.status !== 'green') ?? [];
  const airDo = !cabin ? 'No cabin feed' : offAir.length ? `${offAir[0].metric.label} is outside its range` : 'Air, pressure and temperature are in range';
  const skyDo = level === 'warning' ? 'Go to the storm shelter now' : level === 'watch' ? 'A storm may come: stay near the shelter' : level ? 'No radiation storm expected' : 'No flare data';
  const reading = (key: string) => cabin?.readings.find((x) => x.metric.key === key);
  const airFacts = ['cabin.ppco2', 'cabin.ppo2', 'cabin.pressure'].map((k) => reading(k)).filter((r): r is NonNullable<typeof r> => !!r);
  const AIRNAME: Record<string, string> = { 'cabin.ppco2': 'Carbon dioxide', 'cabin.ppo2': 'Oxygen', 'cabin.pressure': 'Air pressure' };

  return (
    <div className="cabin">
      <i className="safe safe-left" aria-hidden />
      <i className="safe safe-right" aria-hidden />
      {/* one look: two reads, each a word, a sentence, three numbers; everything else behind Details */}
      <section className="one cab-one-left" data-status={air ?? undefined}>
        <span className="cap">Cabin air · {live ? 'live' : `recorded ${recAt ? fmtDate(new Date(recAt).toISOString()) : ''}`}</span>
        <b className="one-word">{air ? STATUS_WORD[air] : 'No feed'}</b>
        <span className="one-do">{airDo}</span>
        <dl className="one-facts">
          {airFacts.map((r) => (
            <div key={r.metric.key} data-status={r.status && r.status !== 'green' ? r.status : undefined}>
              <dd>
                {r.value != null ? r.value.toFixed(r.metric.digits) : '--'}
                <small>{r.metric.unit}</small>
              </dd>
              <dt>{AIRNAME[r.metric.key]}</dt>
            </div>
          ))}
        </dl>
        <button type="button" className="one-more" aria-expanded={more === 'air'} onClick={() => setMore((x) => (x === 'air' ? null : 'air'))}>
          {more === 'air' ? 'Hide details' : 'Details'}
        </button>
        {more === 'air' && (
          <div className="one-details">
            <p className="cap">
              {AIR.map((a) => {
                const r = reading(a.key);
                const v = r?.value != null ? r.value.toFixed(r.metric.digits) : '--';
                return a.key === 'cabin.ppco2' || a.key === 'cabin.ppo2' ? `${a.label} ${v}` : `${a.label ? `${a.label} ` : ''}${v} ${r?.metric.unit ?? ''}`;
              }).join(' · ')}
            </p>
            <p className="cap">Tanks · {tanks.map((t, i) => `${TANK[t.metric.key] ?? t.metric.short} ${t.value != null ? Math.round(t.value) : '--'} %${i === 0 ? ' full' : ''}`).join(' · ')}</p>
            <div className="cab-rad">
              <DoseBody status={doseStatus} f={f} />
              <div className="cab-dose-text">
                <span className="cap">Radiation so far · {seat[cv.m.id]} · {PLACE[cd.mission.environment] ?? cd.environments[cd.mission.environment]?.label}</span>
                <b className={`cab-big st-${doseStatus}`}>{dose.fraction != null ? `${(dose.fraction * 100).toFixed(1)} %` : '--'}</b>
                <span className="cap">
                  of the career limit used · {dose.cumulative_mSv?.toFixed(0) ?? '--'} of {dose.careerLimit_mSv} mSv · today {dose.daily_mSv?.toFixed(2) ?? '--'} mSv
                </span>
                <p className="cab-plain">Radiation harms bone marrow, eyes, brain and skin first. They light up as the dose grows.</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="one cab-one-right" data-status={storm ?? undefined}>
        <span className="cap">Space weather · next {data.storm.meta.horizon_hours} hours</span>
        <b className="one-word">{latest ? (level === 'none' ? 'Quiet' : level === 'watch' ? 'Watch' : 'Warning') : 'No feed'}</b>
        <span className="one-do">{skyDo}</span>
        <dl className="one-facts">
          {latest && (
            <div data-status={storm && storm !== 'green' ? storm : undefined}>
              <dd>
                {Math.round(latest.p_storm * 100)}
                <small>%</small>
              </dd>
              <dt>Storm chance</dt>
            </div>
          )}
          {latest && (
            <div>
              <dd>{latest.flare_class}</dd>
              <dt>Latest solar flare</dt>
            </div>
          )}
          <div data-status={doseStatus !== 'green' ? doseStatus : undefined}>
            <dd>
              {dose.fraction != null ? (dose.fraction * 100).toFixed(1) : '--'}
              <small>%</small>
            </dd>
            <dt>Career radiation limit used</dt>
          </div>
        </dl>
        {ForecastPage ? (
          <button type="button" className="solid one-btn" onClick={() => setParams({ mode: 'forecast' }, { replace: true })}>
            Open forecast
          </button>
        ) : (
          <button type="button" className="solid one-btn" onClick={() => setParams({ mode: 'replay' }, { replace: true })}>
            Replay the May 2024 storm
          </button>
        )}
        <button type="button" className="one-more" aria-expanded={more === 'sky'} onClick={() => setMore((x) => (x === 'sky' ? null : 'sky'))}>
          {more === 'sky' ? 'Hide details' : 'Details'}
        </button>
        {more === 'sky' && (
          <div className="one-details">
            <div className="cab-chart">
              <StormChart events={events} meta={data.storm.meta} height={150} />
            </div>
            <p className="cap">
              e{'ˣ'} model, tested on {data.storm.meta.test_period.map((d) => d.slice(0, 4)).join('-')} · warned before {caught} of {m.n_storms} storms · about {Math.round(m.false_alarms_per_month)} false alarm{Math.round(m.false_alarms_per_month) === 1 ? '' : 's'} a month · typically {m.median_lead_time_h.toFixed(1)} h of warning
            </p>
            <p className="cap">Space weather data: NASA CCMC DONKI</p>
            <div className="cab-acts">
              {ForecastPage && (
                <button type="button" className="ghost" onClick={() => setParams({ mode: 'replay' }, { replace: true })}>
                  Replay the May 2024 storm
                </button>
              )}
              <button type="button" className="ghost" onClick={() => setParams({ mode: 'shelter' }, { replace: true })}>
                Run a storm drill
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
