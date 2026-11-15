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

  const [more, setMore] = useState(false);
  const recent = useMemo(() => (data ? sortedEvents(data.storm).slice(-1) : []), [data]);
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
        <span className="cap">{isNow ? `Space weather · next ${horizon} hours` : `Space weather · ${when(flare.peak_time).split(',')[0]} ${new Date(flare.peak_time).getUTCFullYear()}`}</span>
        <b className={`pat-word wx-word st-${status}`}>{LEVEL_WORD[f.level]}</b>
        <span className="wx-do">{LEVEL_DO[f.level]}</span>

        <dl className="wx-facts">
          <div data-status={status !== 'green' ? status : undefined}>
            <dd>{f.chancePct} %</dd>
            <dt>Storm chance</dt>
          </div>
          <div>
            <dd>{f.typicalWarningH.toFixed(1)} h</dd>
            <dt>Warning time</dt>
          </div>
          <div>
            <dd>{SHIELD[env].word}</dd>
            <dt>Shield on {PLACE[env] === 'Mars transit' ? 'the way' : PLACE[env] === 'ISS' ? 'the ISS' : PLACE[env] === 'Moon' ? 'the Moon' : PLACE[env]}</dt>
          </div>
        </dl>

        <button type="button" className="solid wx-btn" onClick={() => setParams({ mode: 'shelter' }, { replace: true })}>
          Practise the shelter drill
        </button>
        <button type="button" className="wx-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Hide details' : 'Details'}
        </button>
        {more && (
          <dl className="wx-rows">
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
                <small>{f.front ? `reaches the crew's distance about ${Math.round(f.front.hours)} h after the flare` : 'no eruption cloud with this flare'}</small>
              </dt>
              <dd>{f.front ? `${Math.round(f.front.kms).toLocaleString('en-US')} km/s` : 'None'}</dd>
            </div>
            <div className="wx-row">
              <dt>
                Extra dose, no shelter
                <small>{dose ? `${seat[cv.m.id]}, worst storm day of this simulated mission` : 'no storm day in this crew record'}</small>
              </dt>
              <dd>{dose ? `+${dose.extra.toFixed(1)} mSv` : '--'}</dd>
            </div>
            <div className="wx-row wx-row-src">
              <dt>
                <small>
                  Real solar flares: NASA DONKI. Forecast: e{'\u02e3'} model, not an official forecast. Warning time is typical for real storms in the model's test. Route drawn for a 400 km/s solar wind.
                </small>
              </dt>
            </div>
          </dl>
        )}
      </section>

      <section className="wx-chart">
        <SunMap f={f} env={env} />
        {may && (
          <div className="wx-picks" role="group" aria-label="Day shown on the map">
            <button type="button" className="wx-pick" aria-pressed={isNow} onClick={() => setPick(null)}>
              Now
            </button>
            <button type="button" className="wx-pick" aria-pressed={!isNow} onClick={() => setPick(may.flare_id)}>
              A real storm · May 2024
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
