// Check-in: the five 1-5 self-report scales (words on every step, no emojis). Stored by
// data/mind (local, queued for the server). Mood feeds the brain region.
import { useEffect, useState } from 'react';
import { getActivity, getWeek, logActivity, type Activity } from '../data/live';
import { SCALES, streak, useMind } from '../data/mind';
import { Panel } from './ui';
import { useConsole } from './useConsole';

export function CheckinPanel({ className = '' }: { className?: string }) {
  const { cd, cv } = useConsole();
  const mind = useMind();
  const id = cv?.m.id;
  const date = cd?.mission.today;
  const pull = mind.pull;
  const [week, setWeek] = useState<Record<string, number> | null>(null);
  const [act, setAct] = useState<Activity | null>(null);
  const [actDone, setActDone] = useState(false);
  useEffect(() => {
    if (id && date) void pull(id, date);
    if (id) void getWeek(id).then(setWeek);
    if (id && date) void getActivity(id, date).then(setAct);
  }, [id, date, pull]);
  if (!cd || !cv) return null;
  const report = mind.reports[cv.m.id]?.[cd.mission.today] ?? {};
  const srv = mind.server[`${cv.m.id}|${cd.mission.today}`];
  const run = srv?.progress?.checkin_streak ?? streak(mind.reports[cv.m.id], cd.mission.today);
  return (
    <Panel label="Check-in" icon="mind" aside={`${Object.keys(report).length} of 5 answered · ${run} days in a row`} className={className}>
      {SCALES.map((s) => (
        <div key={s.key} className="scale">
          <span className="label">{s.label}</span>
          <div className="scale-row">
            {(mind.words[s.key] ?? s.words).map((w, i) => (
              <button key={w} type="button" aria-pressed={report[s.key] === i + 1} onClick={() => mind.setScore(cv.m.id, cd.mission.today, s.key, i + 1)}>
                {w}
                <small>{i + 1}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
      {act && (
        <button type="button" className="btn" style={{ marginTop: 10 }} disabled={actDone} onClick={() => void logActivity(act.id, cv.m.id).then(setActDone)}>
          {actDone ? `${act.label} · done` : `Suggested: ${act.minutes ? `${act.minutes} minutes of ` : ''}${act.label.toLowerCase()}`}
        </button>
      )}
      {week && (
        <p className="note" style={{ marginTop: 8 }}>
          Your average this week: {SCALES.map((s) => (week[s.key] != null ? `${s.label} ${week[s.key].toFixed(1)}` : null)).filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="note" style={{ marginTop: 4 }}>{mind.queue.length ? `${mind.queue.length} waiting to send` : 'Saved'}</p>
    </Panel>
  );
}
