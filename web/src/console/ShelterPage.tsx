// Shelter drill, one look: a countdown, one sentence, three dose numbers, one button, three
// steps. Everything else is behind Details. a real warning from storm_forecast.json replayed as a live alarm. The warning
// arrives, a countdown runs to "particles arrive" (drill clock: one second per hour of the
// model's real lead time), the crew moves to shelter with one confirm, and the dose with and
// without shelter is compared. The sheltered figure is an estimate and says so.
import { useEffect, useMemo, useState } from 'react';
import { sortedEvents } from '../core/radiation';
import { Confirm } from './ui';
import './weather/weather.css';
import './shelter.css';
import { useConsole } from './useConsole';

/** Assumed shelter effect on the storm excess. Not measured; shown on screen as an assumption. */
const SHELTER_KEEPS = 0.5;
/** Real seconds the drill takes, whatever the storm's warning time was. */
const DRILL_SECONDS = 15;

export default function ShelterPage() {
  const { data, cd, cv, seat } = useConsole();
  const [phase, setPhase] = useState<'ready' | 'warning' | 'sheltered' | 'arrived'>('ready');
  const [t, setT] = useState(0); // drill hours elapsed
  const [ask, setAsk] = useState(false);
  const [safe, setSafe] = useState(false); // the crew confirmed the move to the shelter
  const [more, setMore] = useState(false);
  // the storm day in the crew series is the day with the highest daily dose (the generator puts the
  // one real storm of the mission window there); the warning is the verified one nearest that day
  const stormDay = useMemo(() => {
    const s = cv?.m.series.filter((r) => r.dose_mSv_day != null) ?? [];
    return s.length ? s.reduce((a, b) => (b.dose_mSv_day! > a.dose_mSv_day! ? b : a)).date : null;
  }, [cv]);
  const ev = useMemo(() => {
    if (!data) return undefined;
    const warn = sortedEvents(data.storm).filter((e) => e.alert_level === 'warning' && e.actual_storm && e.lead_time_h != null);
    if (!stormDay) return warn.at(-1);
    const t0 = Date.parse(stormDay);
    return [...warn].sort((a, b) => Math.abs(Date.parse(a.peak_time) - t0) - Math.abs(Date.parse(b.peak_time) - t0))[0];
  }, [data, stormDay]);
  const lead = ev?.lead_time_h ?? 0;

  useEffect(() => {
    // the whole warning time plays in DRILL_SECONDS, and waits while the confirm dialog is open
    if ((phase !== 'warning' && phase !== 'sheltered') || ask || lead <= 0) return;
    const id = window.setInterval(() => setT((x) => x + lead / (DRILL_SECONDS * 10)), 100);
    return () => window.clearInterval(id);
  }, [phase, ask, lead]);
  useEffect(() => {
    if (t >= lead && (phase === 'warning' || phase === 'sheltered')) setPhase('arrived');
  }, [t, lead, phase]);

  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;
  if (!ev) return <p className="cx-error">No verified storm warning in the forecast file</p>;

  // dose on the storm days in the (simulated) crew series, against the site's normal daily dose
  const near = cv.m.series.filter((r) => r.date === stormDay && r.dose_mSv_day != null);
  const normal = cd.environments[cd.mission.environment].dose_mSv_day;
  const storm = near.length ? Math.max(...near.map((r) => r.dose_mSv_day!)) : null;
  const excess = storm != null ? Math.max(0, storm - normal) : null;
  const sheltered = excess != null ? normal + excess * SHELTER_KEEPS : null;
  const left = Math.max(0, lead - t);

  // plain dates: "30 Jul 2026, 17:00"
  const fmtT = (x?: string | null, time = true) => {
    const d = x ? new Date(x.length <= 10 ? `${x}T00:00:00Z` : x.endsWith('Z') ? x : `${x}Z`) : null;
    if (!d || Number.isNaN(d.getTime())) return '--';
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return time ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}` : day;
  };
  const word = phase === 'arrived' ? (safe ? 'Safe' : 'Exposed') : `${(phase === 'ready' ? lead : left).toFixed(1)} h`;
  const line =
    phase === 'ready'
      ? 'Warning time before the radiation arrives'
      : phase === 'warning'
        ? 'Go to the shelter now'
        : phase === 'sheltered'
          ? 'In the shelter. Stay until it passes.'
          : safe
            ? 'The radiation arrived. The crew was in the shelter.'
            : 'The radiation arrived before the crew sheltered.';
  const tone = phase === 'warning' || (phase === 'arrived' && !safe) ? 'red' : 'green';
  const steps: [string, boolean][] = [
    ['Warning shown', phase !== 'ready'],
    ['Crew in the shelter', safe],
    ['Radiation arrives', phase === 'arrived'],
  ];
  const restart = () => {
    setT(0);
    setSafe(false);
    setPhase('ready');
  };

  return (
    <div className="wx sh" data-status={tone}>
      <section className="wx-read" aria-live="polite">
        <span className="cap">Storm drill · real warning of {fmtT(ev.peak_time, false)}</span>
        <b className={`pat-word wx-word sh-word st-${tone}`}>{word}</b>
        <span className="wx-do">{line}</span>

        <dl className="wx-facts">
          <div data-status="red">
            <dd>{storm?.toFixed(1) ?? '--'}</dd>
            <dt>mSv without shelter</dt>
          </div>
          <div>
            <dd>{sheltered?.toFixed(1) ?? '--'}</dd>
            <dt>mSv in the shelter</dt>
          </div>
          <div>
            <dd>{excess != null ? (excess * (1 - SHELTER_KEEPS)).toFixed(1) : '--'}</dd>
            <dt>mSv avoided</dt>
          </div>
        </dl>

        {phase === 'ready' && (
          <button type="button" className="solid wx-btn" onClick={() => { setT(0); setSafe(false); setPhase('warning'); }}>
            Start the drill
          </button>
        )}
        {phase === 'warning' && (
          <button type="button" className="solid wx-btn sh-go" onClick={() => setAsk(true)}>
            Move to the shelter
          </button>
        )}
        {(phase === 'sheltered' || phase === 'arrived') && (
          <button type="button" className="solid wx-btn" onClick={restart}>
            Run it again
          </button>
        )}
        <button type="button" className="wx-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? 'Hide details' : 'Details'}
        </button>
        {more && (
          <dl className="wx-rows">
            <div className="wx-row">
              <dt>
                Solar flare
                <small>storm began {fmtT(ev.storm_onset_time)} UTC</small>
              </dt>
              <dd>{ev.flare_class}</dd>
            </div>
            <div className="wx-row">
              <dt>
                Storm chance
                <small>{ev.has_linked_cme && ev.cme_speed_kms ? `eruption at ${Math.round(ev.cme_speed_kms).toLocaleString('en-US')} km/s` : 'no eruption cloud with this flare'}</small>
              </dt>
              <dd>{Math.round(ev.p_storm * 100)} %</dd>
            </div>
            <div className="wx-row">
              <dt>
                A normal day
                <small>
                  {seat[cv.m.id]}, dose figures are from the worst storm day of this simulated mission, {fmtT(stormDay, false)}
                </small>
              </dt>
              <dd>{normal} mSv</dd>
            </div>
            <div className="wx-row wx-row-src">
              <dt>
                <small>In the shelter is an estimate: the shelter is assumed to block half of the extra storm radiation. Not measured. The drill plays the real warning time in {DRILL_SECONDS} seconds.</small>
              </dt>
            </div>
          </dl>
        )}
      </section>

      <ol className="sh-steps" aria-label="Drill steps">
        {steps.map(([l, on], k) => (
          <li key={l} data-on={on} data-now={!on && (k === 0 || steps[k - 1][1])}>
            <span className="sh-n">{k + 1}</span>
            <span className="sh-l">{l}</span>
          </li>
        ))}
      </ol>

      <Confirm
        open={ask}
        code="4.001"
        title="Move to shelter"
        tag="Storm"
        status={`Radiation in ${left.toFixed(1)} h`}
        body={`A solar storm is likely (${Math.round(ev.p_storm * 100)} %). Stop outside work and move all crew to the shelter.`}
        go="Shelter"
        danger
        onDone={() => {
          setAsk(false);
          setSafe(true);
          if (phase === 'warning') setPhase('sheltered');
        }}
        onCancel={() => setAsk(false)}
      />
    </div>
  );
}
