// Space-weather forecast for the crew: one status word, what to do, a risk table and a map of
// the route radiation takes from the Sun to the crew. Every figure is read from
// storm_forecast.json (flare, storm chance, eruption speed, tested warning time) and the crew
// series (extra storm dose); the route is geometry (model.ts). Crew language: big word, plain
// captions, hairline rows, white action; controls sized for gloved hands.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { replayEvents, sortedEvents } from '../../core/radiation';
import { useConsole } from '../useConsole';
import { forecastFor, LEVEL_DO, LEVEL_STATUS, LEVEL_WORD, lonText, PATH_WORD, PLACE, SHIELD, stormExtraDose } from './model';
import { SunMap } from './SunMap';
import './weather.css';

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
};

export default function ForecastPage() {
  const { data, cd, cv, seat } = useConsole();
  const [, setParams] = useSearchParams();
  const [pick, setPick] = useState<string | null>(null);

  const recent = useMemo(() => (data ? sortedEvents(data.storm).slice(-4).reverse() : []), [data]);
  // the first verified warning of the May 2024 storm: a known bad day to compare with
  const may = useMemo(() => (data ? replayEvents(data.storm).find((e) => e.alert_level === 'warning' && e.actual_storm) ?? null : null), [data]);

  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;
  const latest = recent[0];
  if (!latest) return <p className="cx-error">No solar flare data in the forecast file</p>;

  const env = cd.mission.environment;
  const flare = [...recent, ...(may ? [may] : [])].find((e) => e.flare_id === pick) ?? latest;
  const f = forecastFor(flare, data.storm, env);
  const status = LEVEL_STATUS[f.level];
  const isNow = flare.flare_id === latest.flare_id;
  const dose = stormExtraDose(cv.m, cd, env);
  const horizon = data.storm.meta.horizon_hours;

  return (
    <div className="wx" data-status={status}>
      <section className="wx-read" aria-live="polite">
        <span className="cap">{isNow ? `Space weather · next ${horizon} hours` : `Space weather · ${when(flare.peak_time)} UTC, ${new Date(flare.peak_time).getUTCFullYear()}`}</span>
        <b className={`pat-word wx-word st-${status}`}>{LEVEL_WORD[f.level]}</b>
        <span className="wx-do">{LEVEL_DO[f.level]}</span>

        <dl className="wx-rows">
          <div className="wx-row" data-status={status !== 'green' ? status : undefined}>
            <dt>
              Storm chance
              <small>radiation storm within {horizon} h of this flare</small>
            </dt>
            <dd>{f.chancePct} %</dd>
          </div>
          <div className="wx-row">
            <dt>
              Path to the crew
              <small>{f.conn ? `flare ${lonText(flare.longitude_deg)}, the crew's magnetic line starts ${Math.round(f.conn.footDeg)}° W` : 'flare position not known'}</small>
            </dt>
            <dd>{f.conn ? PATH_WORD[f.conn.path] : 'Unknown'}</dd>
          </div>
          <div className="wx-row">
            <dt>
              Eruption
              <small>{f.front ? `cloud reaches the crew's distance about ${Math.round(f.front.hours)} h after the flare` : 'no eruption cloud linked to this flare'}</small>
            </dt>
            <dd>{f.front ? `${Math.round(f.front.kms).toLocaleString('en-US')} km/s` : 'None'}</dd>
          </div>
          <div className="wx-row">
            <dt>
              Warning time
              <small>typical, from the e{'ˣ'} model's test on real storms</small>
            </dt>
            <dd>{f.typicalWarningH.toFixed(1)} h</dd>
          </div>
          <div className="wx-row">
            <dt>
              Extra dose, no shelter
              <small>{dose ? `${seat[cv.m.id]}, worst storm day of this simulated mission` : 'no storm day in this crew record'}</small>
            </dt>
            <dd>{dose ? `+${dose.extra.toFixed(1)} mSv` : '--'}</dd>
          </div>
          <div className="wx-row">
            <dt>
              Shield here
              <small>
                {PLACE[env]}: {SHIELD[env].why}
              </small>
            </dt>
            <dd>{SHIELD[env].word}</dd>
          </div>
        </dl>
      </section>

      <section className="wx-chart">
        <SunMap f={f} env={env} />
        <div className="wx-picks" role="group" aria-label="Flare shown on the map">
          {recent.map((e, k) => (
            <button key={e.flare_id} type="button" className="wx-pick" aria-pressed={e.flare_id === flare.flare_id} data-status={e.alert_level !== 'none' ? LEVEL_STATUS[e.alert_level as 'watch' | 'warning'] : undefined} onClick={() => setPick(e.flare_id)}>
              <b>{k === 0 ? 'Latest' : when(e.peak_time).split(',')[0]}</b>
              <span>
                {e.flare_class} · {Math.round(e.p_storm * 100)} %
              </span>
            </button>
          ))}
          {may && (
            <button type="button" className="wx-pick wx-pick-may" aria-pressed={may.flare_id === flare.flare_id} data-status="red" onClick={() => setPick(may.flare_id)}>
              <b>May 2024 storm</b>
              <span>
                {may.flare_class} · {Math.round(may.p_storm * 100)} %
              </span>
            </button>
          )}
        </div>
      </section>

      <div className="wx-actions">
        <button type="button" className="solid wx-btn" onClick={() => setParams({ mode: 'shelter' }, { replace: true })}>
          Run a storm drill
        </button>
        <button type="button" className="ghost wx-btn" onClick={() => setParams({ mode: 'replay' }, { replace: true })}>
          Replay May 2024
        </button>
      </div>
      <span className="wx-src">Real solar flares: NASA DONKI · forecast: e{'ˣ'} model, not an official forecast · route drawn for a 400 km/s solar wind</span>
    </div>
  );
}
