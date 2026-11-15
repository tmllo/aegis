// Shelter drill, in the Crew screen's language (one big read, mono captions, hairline rows, one
// white action): a real warning from storm_forecast.json replayed as a live alarm. The warning
// arrives, a countdown runs to "particles arrive" (drill clock: one second per hour of the
// model's real lead time), the crew moves to shelter with one confirm, and the dose with and
// without shelter is compared. The sheltered figure is an estimate and says so.
import { useEffect, useMemo, useState } from 'react';
import { SHELTER_BANNER, sortedEvents } from '../core/radiation';
import { Confirm, Mark } from './ui';
import './shelter.css';
import { useConsole } from './useConsole';

/** Assumed shelter effect on the storm excess. Not measured; shown on screen as an assumption. */
const SHELTER_KEEPS = 0.5;

export default function ShelterPage() {
  const { data, cd, cv, seat } = useConsole();
  const [phase, setPhase] = useState<'ready' | 'warning' | 'sheltered' | 'arrived'>('ready');
  const [t, setT] = useState(0); // drill hours elapsed
  const [ask, setAsk] = useState(false);
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
    if (phase !== 'warning' && phase !== 'sheltered') return;
    const id = window.setInterval(() => setT((x) => x + 0.1), 100);
    return () => window.clearInterval(id);
  }, [phase]);
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

  const fmtT = (x?: string | null) => (x ?? '--').slice(0, 16).replace('T', ' ');
  const word = phase === 'arrived' ? 'Arrived' : `${(phase === 'ready' ? lead : left).toFixed(1)} h`;
  const line =
    phase === 'ready' ? 'Lead time the model gave' : phase === 'warning' ? 'Particles arrive in · crew exposed' : phase === 'sheltered' ? 'Particles arrive in · crew in shelter' : 'Particles on station';
  const steps: [string, boolean][] = [
    ['Warning received', phase !== 'ready'],
    ['Crew in shelter', phase === 'sheltered' || (phase === 'arrived' && t > 0)],
    ['Particles arrive', phase === 'arrived'],
  ];

  return (
    <>
      <i className="safe safe-left" aria-hidden />
      <i className="safe safe-right" aria-hidden />

      <section className="pat sh-pat-left" aria-live="polite">
        <span className="cap">Shelter drill · {ev.flare_class} flare · {fmtT(ev.peak_time)}</span>
        <b className={`pat-word sh-word ${phase === 'warning' ? 'st-red' : ''}`}>{word}</b>
        <span className="cap pat-line">{line}{phase === 'warning' || phase === 'sheltered' ? ' · 1 s = 1 h' : ''}</span>
        {phase !== 'ready' && <span className="cap sh-rule">{SHELTER_BANNER}</span>}
        <div className="sh-rows">
          {steps.map(([l, on]) => (
            <div key={l} className="vrow" data-on={on}>
              <Mark s={on ? 'green' : null} />
              <span className="vrow-l">{l}</span>
              <span className="cap">{on ? 'Done' : ''}</span>
            </div>
          ))}
        </div>
        <span className="cap">
          Storm chance {Math.round(ev.p_storm * 100)} % · {ev.has_linked_cme ? `CME ${ev.cme_speed_kms ?? '--'} km/s` : 'no CME'} · source {ev.source_location ?? '--'}
        </span>
        <span className="cap">Storm onset {fmtT(ev.storm_onset_time)}</span>
      </section>

      <section className="pat sh-pat-right">
        <span className="cap">Dose · {seat[cv.m.id]} · storm day {stormDay ?? '--'}</span>
        <div className="sh-rows">
          <div className="vrow" data-status="red">
            <Mark s="red" />
            <span className="vrow-l">Not sheltered</span>
            <span className="vrow-v sh-big">
              {storm?.toFixed(2) ?? '--'}
              <small>mSv</small>
            </span>
          </div>
          <div className="vrow">
            <Mark s="green" />
            <span className="vrow-l">
              Sheltered
              <small>estimate</small>
            </span>
            <span className="vrow-v sh-big">
              {sheltered?.toFixed(2) ?? '--'}
              <small>mSv</small>
            </span>
          </div>
          <div className="vrow">
            <span />
            <span className="vrow-l">Saved</span>
            <span className="vrow-v">
              {excess != null ? (excess * (1 - SHELTER_KEEPS)).toFixed(2) : '--'}
              <small>mSv</small>
            </span>
          </div>
          <div className="vrow">
            <span />
            <span className="vrow-l">Site normal</span>
            <span className="vrow-v">
              {normal}
              <small>mSv/d</small>
            </span>
          </div>
        </div>
        <span className="cap">Sheltered assumes the shelter halves the storm excess · not measured</span>
      </section>

      <div className="pat-actions">
        {phase === 'ready' && (
          <button type="button" className="solid" onClick={() => { setT(0); setPhase('warning'); }}>
            Start drill
          </button>
        )}
        {phase === 'warning' && (
          <button type="button" className="solid sh-go" onClick={() => setAsk(true)}>
            Move to shelter
          </button>
        )}
        {(phase === 'sheltered' || phase === 'arrived') && (
          <button type="button" className="ghost" onClick={() => { setT(0); setPhase('ready'); }}>
            Reset drill
          </button>
        )}
      </div>

      <Confirm
        open={ask}
        code="4.001"
        title="Move to shelter"
        tag="Storm"
        status={`Particles in ${left.toFixed(1)} h`}
        body={`${ev.flare_class} flare, storm probability ${Math.round(ev.p_storm * 100)} %. Suspend EVA, all crew to the shelter.`}
        go="Shelter"
        danger
        onDone={() => {
          setAsk(false);
          setPhase('sheltered');
        }}
        onCancel={() => setAsk(false)}
      />
    </>
  );
}
