// Shelter drill: a real warning from storm_forecast.json replayed as a live alarm. The warning
// arrives, a countdown runs to "particles arrive" (drill clock: one second per hour of the
// model's real lead time), the crew moves to shelter with one confirm, and the dose with and
// without shelter is compared. The sheltered figure is an estimate and says so.
import { useEffect, useMemo, useState } from 'react';
import { SHELTER_BANNER, sortedEvents } from '../core/radiation';
import { Confirm, KV, Mark, Panel } from './ui';
import { useConsole } from './useConsole';

/** Assumed shelter effect on the storm excess. Not measured; shown on screen as an assumption. */
const SHELTER_KEEPS = 0.5;

export default function ShelterPage() {
  const { data, cd, cv, seat } = useConsole();
  const [phase, setPhase] = useState<'ready' | 'warning' | 'sheltered' | 'arrived'>('ready');
  const [t, setT] = useState(0); // drill hours elapsed
  const [ask, setAsk] = useState(false);
  const ev = useMemo(() => (data ? sortedEvents(data.storm).filter((e) => e.alert_level === 'warning' && e.actual_storm && e.lead_time_h != null).at(-1) : undefined), [data]);
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
  const onset = (ev.storm_onset_time ?? ev.peak_time).slice(0, 10);
  const near = cv.m.series.filter((r) => Math.abs(Date.parse(r.date) - Date.parse(onset)) <= 2 * 86400000 && r.dose_mSv_day != null);
  const normal = cd.environments[cd.mission.environment].dose_mSv_day;
  const storm = near.length ? Math.max(...near.map((r) => r.dose_mSv_day!)) : null;
  const excess = storm != null ? Math.max(0, storm - normal) : null;
  const sheltered = excess != null ? normal + excess * SHELTER_KEEPS : null;
  const left = Math.max(0, lead - t);

  return (
    <>
      <div className="sh-center" data-phase={phase}>
        <span className="label">{phase === 'ready' ? 'Drill' : phase === 'arrived' ? 'Particles arrived' : 'Particles arrive in'}</span>
        <b className="sh-count">{phase === 'ready' ? `${lead.toFixed(1)} h` : phase === 'arrived' ? '0.0 h' : `${left.toFixed(1)} h`}</b>
        <span className="note">{phase === 'ready' ? 'Lead time the model gave for this storm' : 'Drill clock: 1 s = 1 h'}</span>
        {phase !== 'ready' && <p className="sh-banner">{SHELTER_BANNER}</p>}
        <div className="row2" style={{ marginTop: 18 }}>
          {phase === 'ready' && (
            <button type="button" className="btn btn-primary" onClick={() => { setT(0); setPhase('warning'); }}>
              Start drill
            </button>
          )}
          {phase === 'warning' && (
            <button type="button" className="btn btn-alert" style={{ padding: '0 28px' }} onClick={() => setAsk(true)}>
              Move to shelter
            </button>
          )}
          {(phase === 'sheltered' || phase === 'arrived') && (
            <button type="button" className="btn" onClick={() => { setT(0); setPhase('ready'); }}>
              Reset drill
            </button>
          )}
        </div>
      </div>

      <Panel label="Warning" icon="alert" aside={ev.flare_class} className="sh-left">
        <dl className="kvs">
          <KV k="Flare peak" v={ev.peak_time.slice(0, 16).replace('T', ' ')} />
          <KV k="Class" v={ev.flare_class} />
          <KV k="Source" v={ev.source_location ?? '--'} />
          <KV k="Storm probability" v={`${Math.round(ev.p_storm * 100)} %`} status="red" />
          <KV k="Linked CME" v={ev.has_linked_cme ? `${ev.cme_speed_kms ?? '--'} km/s` : 'None'} />
          <KV k="Lead time" v={`${lead.toFixed(1)} h`} />
          <KV k="Storm onset" v={(ev.storm_onset_time ?? '--').slice(0, 16).replace('T', ' ')} />
        </dl>
        <div className="steps gap">
          {[
            ['Warning received', phase !== 'ready'],
            ['Crew to shelter', phase === 'sheltered' || (phase === 'arrived' && t > 0)],
            ['Particles arrive', phase === 'arrived'],
          ].map(([l, on], k) => (
            <div key={l as string} className="step">
              <span className="step-n">{String(k + 1).padStart(2, '0')}</span>
              <Mark s={on ? 'green' : null} />
              <span className="step-t">{l as string}</span>
              <span className="step-v" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel label={`Dose · ${seat[cv.m.id]}`} icon="dial" aside="Storm day" className="sh-right">
        <dl className="stats">
          <div className="st" data-status="red">
            <dt>Not sheltered</dt>
            <dd>
              {storm?.toFixed(2) ?? '--'}
              <small>mSv</small>
            </dd>
          </div>
          <div className="st">
            <dt>Sheltered (estimate)</dt>
            <dd>
              {sheltered?.toFixed(2) ?? '--'}
              <small>mSv</small>
            </dd>
          </div>
        </dl>
        <dl className="kvs gap">
          <KV k="Site normal" v={`${normal} mSv/d`} />
          <KV k="Storm excess" v={excess != null ? `${excess.toFixed(2)} mSv` : '--'} />
          <KV k="Saved (estimate)" v={excess != null ? `${(excess * (1 - SHELTER_KEEPS)).toFixed(2)} mSv` : '--'} />
        </dl>
        <p className="note gap">Not sheltered: the simulated crew dose on the storm days. Sheltered: an estimate that assumes the shelter halves the storm excess; not measured.</p>
      </Panel>

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
