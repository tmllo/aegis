// Mind: the behavioural-health check (isolation and confinement are one of NASA's five hazards).
// Left: today's five answers. Centre: one question at a time, one tap each. Right: this week from
// Tomas's Mind API (/api/wellbeing) and one thing to try (/api/activities).
// Offline: answers stay on this device (data/mind.ts) and are sent when the server answers;
// the week falls back to this device's answers, the suggestion to a fixed list.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SCALES, useMind, type ScaleKey, type SelfReport } from '../../data/mind';
import { getActivity, getWeek, logActivity, type Activity } from '../../data/live';
import type { Status } from '../../data/types';
import { firstName, useStationData } from '../model';
import { useStation } from '../state';
import { Btn } from '../ds';
import { Bar, Check, Page, SideCap } from '../frame';
import { cue } from '../ui';
import MindTalk from '../MindTalk';
import '../mind.css';

/** Stress is bad when high, the others when low. */
const statusOf = (k: ScaleKey, v: number | undefined): Status => {
  if (v == null) return 'green';
  const bad = k === 'stress' ? v : 6 - v;
  return bad >= 5 ? 'red' : bad >= 4 ? 'amber' : 'green';
};

/** Fallback suggestions (no server): the one for the weakest answer. */
const TRY: Record<ScaleKey, Activity> = {
  mood: { id: 'local-journal', label: 'Write one line about today', minutes: 3 },
  stress: { id: 'local-breathing', label: 'Ten minutes of slow breathing', minutes: 10 },
  energy: { id: 'local-walk', label: 'A short treadmill walk', minutes: 15 },
  sleep_quality: { id: 'local-sleep', label: 'Screens off 30 minutes before the sleep window', minutes: 30 },
  social: { id: 'local-call', label: 'Call home or share a meal with the crew', minutes: 20 },
};

export default function Mind() {
  const { data } = useStationData();
  const nav = useNavigate();
  const me = useStation((s) => s.me);
  const sound = useStation((s) => s.sound);
  const toast = useStation((s) => s.toast);
  const reports = useMind((s) => s.reports);
  const setScore = useMind((s) => s.setScore);
  const pull = useMind((s) => s.pull);
  const words = useMind((s) => s.words);
  const today = data?.crew.mission.today ?? '';
  const subject = me && me !== 'medic' ? me : null;
  const report: SelfReport = (subject && reports[subject]?.[today]) || {};
  const firstOpen = SCALES.findIndex((q) => report[q.key] == null);
  const [step, setStep] = useState(firstOpen < 0 ? SCALES.length : firstOpen);
  const [week, setWeek] = useState<Record<string, number> | null>(null);
  const [act, setAct] = useState<Activity | null>(null);
  const [done, setDone] = useState(false);
  // two views with one address each: /mind (check-in) and /mind?v=xai (the assistant)
  const [qs, setQs] = useSearchParams();
  const view: 'check' | 'xai' = qs.get('v') === 'xai' ? 'xai' : 'check';
  const go = (v: 'check' | 'xai') => {
    cue('tick', sound);
    setQs(v === 'xai' ? { v: 'xai' } : {}, { replace: true });
  };

  useEffect(() => {
    if (!subject || !today) return;
    void pull(subject, today);
    void getWeek(subject).then(setWeek);
    void getActivity(subject, today).then(setAct);
  }, [subject, today, pull]);

  if (!data) return null;
  if (!subject) return <Page title="Mind" sub="Private to each crew member. The medic sees only the weekly summary they share." />;

  const statuses = SCALES.map((q) => statusOf(q.key, report[q.key]));
  const overall: Status = statuses.includes('red') ? 'red' : statuses.includes('amber') ? 'amber' : 'green';
  const word = overall === 'red' ? 'Reach out' : overall === 'amber' ? 'Strained' : 'Steady';
  const weakest = [...SCALES].sort((a, b) => (statusOf(b.key, report[b.key]) === 'green' ? 0 : 1) - (statusOf(a.key, report[a.key]) === 'green' ? 0 : 1))[0];
  const suggestion = act ?? (overall !== 'green' ? TRY[weakest.key] : TRY.mood);
  const finished = step >= SCALES.length;
  const q = SCALES[Math.min(step, SCALES.length - 1)];
  const qWords = words[q.key] ?? q.words;

  const todayLine = SCALES.map((s) => `${s.label} ${report[s.key] != null ? (words[s.key] ?? s.words)[report[s.key]! - 1] : 'not answered'}`).join(', ');
  const member = data.crew.crew.find((c) => c.id === subject);
  const seg = (
    <div className="fr-seg" role="tablist" aria-label="Mind view">
      {(
        [
          ['check', 'Check-in'],
          ['xai', 'xAI'],
        ] as const
      ).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => go(k)}>
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'xai')
    return (
      <Page
        className="is-xai"
        title="xAI"
        sub="Your private assistant. It reads today's check-in and stays on this device."
        left={SCALES.map((s, i) => (
          <Check key={s.key} s={statuses[i]} title={s.label} word={report[s.key] != null ? (words[s.key] ?? s.words)[report[s.key]! - 1] : 'Not yet'} />
        ))}
        object={<MindTalk today={todayLine} day={today} name={member ? firstName(member) : 'there'} />}
        right={
          <>
            <SideCap>What xAI knows</SideCap>
            <ul className="mi-know">
              <li>Today's five answers, on the left</li>
              <li>Nothing from your vitals or the crew</li>
              <li>The chat stays on this device</li>
            </ul>
            <SideCap>When it is serious</SideCap>
            <p className="mi-note">Words about harm or a crisis always get the same reply: contact the flight surgeon now. The model never decides that.</p>
            {SCALES.some((s) => report[s.key] == null) && (
              <Btn kind="secondary" onClick={() => go('check')}>
                Finish check-in
              </Btn>
            )}
          </>
        }
        footLeft={seg}
        footRight={<Btn kind="danger" onClick={() => nav(`/surgeon?c=${subject}`)}>Contact surgeon</Btn>}
      />
    );

  const answer = (v: number) => {
    cue('tick', sound);
    setScore(subject, today, q.key, v);
    setStep(step + 1);
  };

  return (
    <Page
      title="Mind"
      sub="Five taps a day. Answers stay private; the ground sees only the weekly summary."
      left={SCALES.map((s, i) => (
        <Check key={s.key} s={statuses[i]} title={s.label} word={report[s.key] != null ? (words[s.key] ?? s.words)[report[s.key]! - 1] : 'Not yet'} onClick={() => setStep(i)} on={!finished && i === step} />
      ))}
      object={
        finished ? (
          <div className="mi-q">
            <p className="mi-q-cap">Today</p>
            <h2 className={`mi-q-word is-${overall}`}>{word}</h2>
            <p className="mi-q-sub">{overall === 'red' ? 'Talk to the crew medic or the flight surgeon today.' : overall === 'amber' ? 'Try the suggestion on the right. It comes up at your next private conference.' : 'Nothing to do. See you tomorrow.'}</p>
            <Btn kind="secondary" onClick={() => go('xai')}>
              Talk it through with xAI
            </Btn>
          </div>
        ) : (
          <div className="mi-q">
            <p className="mi-q-cap">
              {step + 1} of {SCALES.length}
            </p>
            <h2>{q.label === 'Social' ? 'How connected do you feel?' : q.label === 'Sleep' ? 'How did you sleep?' : `How is your ${q.label.toLowerCase()}?`}</h2>
            <div className="mi-q-opts">
              {qWords.map((w, i) => (
                <button key={w} type="button" className={report[q.key] === i + 1 ? 'is-on' : ''} onClick={() => answer(i + 1)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        )
      }
      right={
        <>
          {SCALES.some((s) => (week?.[s.key] ?? report[s.key]) != null) && <SideCap>{week ? 'This week' : 'Today'}</SideCap>}
          {SCALES.map((s) => {
            const v = week?.[s.key] ?? report[s.key];
            if (v == null) return null;
            return <Bar key={s.key} label={s.label} value={`${v.toFixed(1)} / 5`} frac={v / 5} s={statusOf(s.key, Math.round(v))} />;
          })}
          <SideCap>Try today</SideCap>
          <div className="mi-try">
            <b>{suggestion.label}</b>
            {suggestion.minutes != null && <span>{suggestion.minutes} min</span>}
            <Btn
              kind="secondary"
              disabled={done}
              onClick={() => {
                setDone(true);
                cue('chime', sound);
                if (!suggestion.id.startsWith('local-')) void logActivity(suggestion.id, subject);
                toast({ tone: 'green', title: 'Logged', body: suggestion.label });
              }}
            >
              {done ? 'Done' : 'Mark done'}
            </Btn>
          </div>
        </>
      }
      footLeft={seg}
      footRight={overall === 'red' ? <Btn onClick={() => nav(`/surgeon?c=${subject}`)}>Contact surgeon</Btn> : undefined}
    />
  );
}
