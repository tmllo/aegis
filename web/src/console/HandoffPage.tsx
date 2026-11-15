// Handoff: one tap builds the case bundle for an onboard AI medical assistant (who, what drifted,
// own baseline, days running, actions, radiation context) as JSON and a plain summary, then
// shows the report travelling to Earth with the one-way signal delay for the mission site.
import { useEffect, useMemo, useState } from 'react';
import { doseSummary, sortedEvents } from '../core/radiation';
import { LINK_DELAY, rowOf, SHORT, STATUS_WORD } from './model';
import { KV, Panel } from './ui';
import { useConsole } from './useConsole';

/** One-way light time in seconds for the progress animation (physics; Mars uses its mean). */
const DELAY_S: Record<string, number> = { iss: 0.1, moon: 1.3, transit: 300, mars: 750 };

export default function HandoffPage() {
  const { data, cd, cv, seat } = useConsole();
  const [built, setBuilt] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const bundle = useMemo(() => {
    if (!data || !cd || !cv) return null;
    const drifted = cv.scores.filter((s) => s.status !== 'green').map((s) => {
      const r = rowOf(cd, cv.m, cv.scores, s.metric);
      return { metric: s.metric, label: cd.metrics[s.metric].label, value: r.value, unit: r.unit, status: s.status, z_3day: s.z, baseline: cv.m.baseline[s.metric] ?? null, days_running: r.running, action: r.action };
    });
    const dose = doseSummary(cv.m, cd, cd.mission.environment);
    const ev = sortedEvents(data.storm).at(-1);
    return {
      prepared_for: 'Onboard AI medical assistant such as NASA CMO-DA',
      generated: new Date().toISOString(),
      mission: { name: cd.mission.name, site: cd.environments[cd.mission.environment]?.label, day: cd.mission.today },
      crew_member: { id: cv.m.id, seat: seat[cv.m.id], role: cv.m.role, overall: cv.overall },
      drifted,
      radiation: { dose_today_mSv: dose.daily_mSv, mission_dose_mSv: dose.cumulative_mSv, career_fraction: dose.fraction, latest_flare: ev ? { class: ev.flare_class, peak: ev.peak_time, p_storm: ev.p_storm, alert: ev.alert_level } : null },
      data_note: 'Simulated crew data, not real astronaut records. Not medical advice.',
    };
  }, [data, cd, cv, seat]);

  const delay = cd ? DELAY_S[cd.mission.environment] ?? 1 : 1;
  useEffect(() => {
    if (sent == null) return;
    const id = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(id);
  }, [sent]);
  if (!bundle || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  // long delays are shown at 1 s per minute so the demo stays watchable
  const scale = delay > 10 ? 60 : 1;
  const progress = sent == null ? 0 : Math.min(1, (now - sent) / 1000 / (delay / scale));
  const summary = `${seat[cv.m.id]} (${cv.m.role}) is ${STATUS_WORD[cv.overall].toLowerCase()} on ${cd.mission.today}. ${
    bundle.drifted.length
      ? bundle.drifted.map((d) => `${SHORT[d.metric]} ${d.value} ${d.unit} vs usual ${d.baseline ? d.baseline.mean : '--'} for ${d.days_running} d (z ${d.z_3day?.toFixed(1) ?? '--'})`).join('; ') + '.'
      : 'No readings outside the usual range.'
  } Dose today ${bundle.radiation.dose_today_mSv ?? '--'} mSv.`;

  return (
    <>
      <Panel label="Case bundle" icon="note" aside="Prepared for an onboard AI medical assistant such as NASA's CMO-DA" className="ho-mid">
        {!built ? (
          <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
            <button type="button" className="cf-go" style={{ marginTop: 0 }} onClick={() => setBuilt(true)}>
              Build
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 17, lineHeight: 1.5 }}>{summary}</p>
            <pre className="ho-json">{JSON.stringify(bundle, null, 2)}</pre>
          </>
        )}
      </Panel>

      <Panel label="Link to Earth" icon="ground" aside={`One way ~${LINK_DELAY[cd.mission.environment] ?? '--'}`} className="ho-right">
        <dl className="kvs">
          <KV k="Crew member" v={seat[cv.m.id]} />
          <KV k="Drifted" v={bundle.drifted.length} status={bundle.drifted.length ? 'amber' : null} />
          <KV k="Site" v={bundle.mission.site} />
          <KV k="Report arrives in" v={`~${LINK_DELAY[cd.mission.environment] ?? '--'}`} />
        </dl>
        <div className="ho-path gap">
          <span className="label">Station</span>
          <div className="meter-bar" style={{ flex: 1 }}>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="label">Earth</span>
        </div>
        <p className="note">{sent == null ? 'Not sent' : progress >= 1 ? 'Delivered to the flight surgeon queue' : `In transit${scale > 1 ? ' (shown 1 s per minute)' : ''}`}</p>
        <button type="button" className="btn btn-primary mt-auto" disabled={!built} onClick={() => { setSent(performance.now()); setNow(performance.now()); }}>
          {sent == null ? 'Send report' : progress >= 1 ? 'Send again' : 'Sending'}
        </button>
      </Panel>
    </>
  );
}
