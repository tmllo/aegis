// Crew "Details": every metric we have as a slider against her own usual, grouped by body system,
// then what can be tracked live right now and when it was last measured, with one Measure action.
import { useNavigate } from 'react-router-dom';
import type { MetricKey } from '../../data/types';
import { useMind } from '../../data/mind';
import { useCheckSession } from '../checkup/session';
import { useConsole } from '../useConsole';
import { MetricSlider } from './MetricSlider';
import './vitals.css';

const GROUPS: [string, MetricKey[]][] = [
  ['Heart and blood', ['hr', 'bp_sys', 'bp_dia', 'glucose']],
  ['Body', ['temp', 'bone_loss_pct']],
  ['Sleep, mood and exercise', ['sleep_h', 'mood', 'exercise_min']],
  ['Radiation', ['dose_mSv_day', 'dose_mSv_cum']],
];

export function VitalsPanel({ memberId, editable = true }: { memberId?: string; editable?: boolean }) {
  const { cd, cv } = useConsole();
  const nav = useNavigate();
  const session = useCheckSession();
  const reports = useMind((s) => s.reports);
  if (!cd || !cv) return null;
  const id = memberId ?? cv.m.id;
  const today = cd.mission.today;
  const mine = session.subject === id && session.date === today;
  const answered = Object.keys(reports[id]?.[today] ?? {}).length;

  const live: [string, string, string][] = [
    ['Heart and breathing', 'camera scan, on this device', mine && session.scan ? `today · ${session.scan.bpm ?? '--'} bpm` : 'not yet today'],
    ['Heart rate', 'wrist band (simulated)', mine && session.band ? `today · ${session.band.hr} bpm` : 'not yet today'],
    ['Reaction time', 'reaction test, 1 min', mine && session.pvt ? `today · ${session.pvt.meanMs} ms` : 'not yet today'],
    ['Mood, stress, energy, sleep, connection', 'check-in, 5 questions', answered ? `today · ${answered} of 5` : 'not yet today'],
  ];

  return (
    <div className="vp">
      {GROUPS.map(([title, keys]) => (
        <section key={title} className="vp-group" aria-label={title}>
          <h3 className="vp-title">{title}</h3>
          {keys.map((k) => (cd.metrics[k] ? <MetricSlider key={k} metricKey={k} memberId={id} editable={editable} /> : null))}
        </section>
      ))}

      <section className="vp-group" aria-label="Track live">
        <h3 className="vp-title">Track live</h3>
        {live.map(([what, how, when]) => (
          <div key={what} className="vp-live">
            <span className="vs-label">
              {what}
              <small>{how}</small>
            </span>
            <span className="vp-when">{when}</span>
          </div>
        ))}
        <button type="button" className="solid vp-measure" onClick={() => nav('/checkup')}>
          Measure now
        </button>
      </section>
    </div>
  );
}
