// Mind HUD: today's habits and to-dos with a quiet streak, the five self-report scales
// (1-5, a word on each step), and a private journal that never leaves this device.
// Stored by data/mind (local, queued for the ground server). Mood feeds the brain region.
import { useEffect, useState } from 'react';
import { isDone, SCALES, streak, tasksFor, useMind } from '../data/mind';
import { Icon, Mark, Panel } from './ui';
import { useConsole } from './useConsole';

export default function MindPage() {
  const { cd, cv, seat } = useConsole();
  const mind = useMind();
  const [todo, setTodo] = useState('');
  const [note, setNote] = useState('');
  const subject = cv?.m.id;
  const date = cd?.mission.today;
  const pull = mind.pull;
  useEffect(() => {
    if (subject && date) void pull(subject, date);
  }, [subject, date, pull]);
  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const id = cv.m.id;
  const today = cd.mission.today;
  const report = mind.reports[id]?.[today] ?? {};
  // server list (routines, system tasks from alerts, real streaks) when it answers, else local
  const srv = mind.server[`${id}|${today}`];
  const local = tasksFor(mind.tasks, id);
  const tasks = srv
    ? [
        ...srv.tasks.map((t) => ({ id: t.id, label: t.label, kind: t.kind, origin: t.origin, serverDone: t.done, streak: t.streak })),
        ...local.filter((t) => t.origin === 'self' && !srv.tasks.some((s) => s.id === t.id)).map((t) => ({ ...t, serverDone: false, streak: 0 })),
      ]
    : local.map((t) => ({ ...t, serverDone: false, streak: 0 }));
  const isOn = (t: { id: string; serverDone: boolean }) => t.serverDone || isDone(mind.events, t.id, today);
  const done = tasks.filter(isOn).length;
  const run = srv?.progress?.checkin_streak ?? streak(mind.reports[id], today);
  // alert tasks come from the server when it runs; offline they are derived from today's scores
  const system = srv ? [] : cv.scores.filter((s) => s.status !== 'green');
  const notes = mind.notes.filter((n) => n.subject === id).slice(0, 4);

  return (
    <>
      <Panel label={`Today · ${seat[id]}`} icon="checkin" aside={`${done}/${tasks.length + system.length} · streak ${run} d${srv?.progress ? ` · L${srv.progress.level}` : ''}`} className="mi-left">
        <div className="steps">
          {system.map((s, i) => (
            <div key={s.metric} className="step" data-status={s.status}>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <Mark s={s.status} />
              <span className="step-t">
                Re-measure {cd.metrics[s.metric].label.toLowerCase()}
                <small>From an alert</small>
              </span>
              <span className="step-v" />
            </div>
          ))}
          {tasks.map((t, i) => {
            const on = isOn(t);
            return (
              <button key={t.id} type="button" className="step" data-done={on || undefined} aria-pressed={on} onClick={() => mind.toggle(id, t.id, today)}>
                <span className="step-n">{String(system.length + i + 1).padStart(2, '0')}</span>
                <span className="check">{on && <Icon name="checkin" size={14} />}</span>
                <span className="step-t">
                  {t.label}
                  <small>
                    {t.origin === 'system' ? 'From an alert' : t.kind === 'habit' ? 'Habit' : 'To-do'}
                    {t.streak ? ` · ${t.streak} d` : ''}
                  </small>
                </span>
                <span className="step-v" />
              </button>
            );
          })}
        </div>
        <form
          className="row2 gap"
          onSubmit={(e) => {
            e.preventDefault();
            mind.addTodo(id, todo);
            setTodo('');
          }}
        >
          <input className="field" value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="Add a to-do" aria-label="Add a to-do" />
          <button type="submit" className="btn" disabled={!todo.trim()}>
            Add
          </button>
        </form>
      </Panel>

      <Panel label="Check-in" icon="mind" aside={`${Object.keys(report).length}/5 · ${today}`} className="mi-mid">
        {SCALES.map((s) => (
          <div key={s.key} className="scale">
            <span className="label">{s.label}</span>
            <div className="scale-row">
              {(mind.words[s.key] ?? s.words).map((w, i) => (
                <button key={w} type="button" aria-pressed={report[s.key] === i + 1} onClick={() => mind.setScore(id, today, s.key, i + 1)}>
                  {w}
                  <small>{i + 1}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="note" style={{ marginTop: 'auto' }}>
          Mood feeds the brain reading on Vitals. {mind.queue.length ? `${mind.queue.length} waiting for the server.` : 'Synced.'}
        </p>
      </Panel>

      <Panel label="Journal" icon="note" aside="Private" className="mi-right">
        <textarea className="field" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line about today" aria-label="Journal" />
        <button
          type="button"
          className="btn btn-primary gap"
          disabled={!note.trim()}
          onClick={() => {
            mind.addNote(id, note);
            setNote('');
          }}
        >
          Save
        </button>
        <span className="label gap">On this device only</span>
        <div className="steps">
          {notes.map((n) => (
            <div key={n.id} className="step" style={{ gridTemplateColumns: '1fr' }}>
              <span className="step-t">
                {n.text}
                <small>{n.t.slice(0, 16).replace('T', ' ')}</small>
              </span>
            </div>
          ))}
          {!notes.length && <p className="note">No entries yet</p>}
        </div>
      </Panel>
    </>
  );
}
