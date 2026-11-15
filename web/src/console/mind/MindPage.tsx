// Mind: behavioural health in the Crew language. Left: the read (one word from the rules), the
// reasons and who it goes to, then today's 5-tap check-in. Right: one view at a time: this week,
// things to try, the private journal, Ask eˣ, and the care plan with its sources.
// Data: Tomas's Mind API through ./api.ts and data/mind.ts (check-in queue), offline fallbacks throughout.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMind } from '../../data/mind';
import { LINK_DELAY } from '../model';
import { Mark } from '../ui';
import { useConsole } from '../useConsole';
import { askModel, SUGGESTED_QUESTIONS, type Answer } from './advisor';
import { useMindData } from './api';
import { CARE, sourceById } from './care';
import { OneQuestion } from './OneQuestion';
import { assess, routeText, type ScoreKey, type Today } from './rules';
import './mind.css';

type View = 'check' | 'week' | 'try' | 'journal' | 'ask' | 'care';
const VIEWS: [View, string][] = [
  ['check', 'Check-in'],
  ['week', 'Week'],
  ['try', 'Try'],
  ['journal', 'Journal'],
  ['ask', 'Ask'],
  ['care', 'Care'],
];

const WEEK_ROWS: [ScoreKey, string, boolean][] = [
  ['self.mood', 'Mood', false],
  ['self.stress', 'Stress', true],
  ['self.energy', 'Energy', false],
  ['self.social', 'Connected', false],
  ['self.sleep_quality', 'Sleep quality', false],
  ['self.sleep_h', 'Sleep hours', false],
];

export default function MindPage() {
  const { cd, cv, seat } = useConsole();
  const m = cv?.m;
  const today = cd?.mission.today;
  const mind = useMind();
  const data = useMindData(m, today);
  const [view, setView] = useState<View>('check');
  const [q, setQ] = useState('');
  const [reply, setReply] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [openAct, setOpenAct] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (m && today) void mind.pull(m.id, today);
    // pull once per member and day; the store keeps the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, today]);

  const report = (m && today ? mind.reports[m.id]?.[today] : undefined) ?? {};
  const todayScores: Today = useMemo(
    () => Object.fromEntries(Object.entries(report).map(([k, v]) => [`self.${k}`, v])) as Today,
    [report],
  );
  const read = useMemo(() => assess(data.wellbeing, todayScores), [data.wellbeing, todayScores]);
  const delay = cd ? (LINK_DELAY[cd.mission.environment] ?? 'seconds') : 'seconds';

  if (!cd || !cv || !m || !today) return <p className="cx-error cx-wait">Loading</p>;


  const ask = async (text: string) => {
    if (!text.trim()) return;
    setQ(text);
    setAsking(true);
    setReply(await askModel(text, read, delay));
    setAsking(false);
  };
  const submitAsk = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };
  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void data.addNote(draft.trim());
    setDraft('');
  };

  const last = data.wellbeing?.weeks.at(-1)?.scores ?? {};
  const prev = data.wellbeing?.weeks.at(-2)?.scores ?? {};

  return (
    <div className="mi" data-status={read.status}>
      <i className="safe safe-left" aria-hidden />
      <i className="safe safe-right" aria-hidden />

      <section className="pat mi-left brk" aria-live="polite">
        <span className="cap">Mind · {seat[m.id]} · {today}</span>
        <b className="pat-word mi-word">{read.word}</b>
        <span className="cap pat-line">{read.reasons[0] ?? 'Mood, stress and sleep within her usual'}</span>
        <span className="mi-route">{routeText(read.route, delay)}</span>

      </section>

      <section className="pat mi-right">
        {!more && view === 'check' ? (
          <div className="mi-view">
            <OneQuestion subject={m.id} date={today} />
            <button type="button" className="ghost mi-more" onClick={() => { setMore(true); setView('week'); }}>More</button>
          </div>
        ) : (
        <>
        <div className="mi-tabs" role="tablist" aria-label="Mind views">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className="ghost" onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>

        {view === 'week' && (
          <div className="mi-view" role="tabpanel">
            <span className="cap">This week vs last week{data.online === false ? ' · from the crew file' : ''}</span>
            {WEEK_ROWS.map(([k, label, highBad]) => {
              const now = last[k]?.mean;
              const before = prev[k]?.mean;
              if (now == null) return null;
              const d = before != null ? now - before : 0;
              const worse = highBad ? d >= 0.5 : k === 'self.sleep_h' ? now < 6 || d <= -0.75 : d <= -0.5;
              return (
                <div key={k} className="vrow" data-status={worse ? 'amber' : undefined}>
                  <Mark s={worse ? 'amber' : 'green'} />
                  <span className="vrow-l">
                    {label}
                    <small>{before != null ? `last week ${before.toFixed(1)}` : 'first week'}</small>
                  </span>
                  <span className="vrow-v">
                    {now.toFixed(1)}
                    <small>{k === 'self.sleep_h' ? 'h' : '/5'}</small>
                  </span>
                </div>
              );
            })}
            {data.wellbeing?.checkin_streak != null && <span className="cap">Check-in streak {data.wellbeing.checkin_streak} days</span>}
          </div>
        )}

        {view === 'try' && (
          <div className="mi-view" role="tabpanel">
            <span className="cap">Things to try · a few minutes each</span>
            {data.activities.slice(0, 5).map((a) => (
              <div key={a.id} className="mi-act">
                <button type="button" className="vrow" aria-expanded={openAct === a.id} onClick={() => setOpenAct(openAct === a.id ? null : a.id)}>
                  <Mark s={a.done_today ? 'green' : null} />
                  <span className="vrow-l">
                    {a.label}
                    <small>{a.suggested ? 'suggested for today' : `${a.minutes} min`}</small>
                  </span>
                  <span className="cap">{a.done_today ? 'Done' : ''}</span>
                </button>
                {openAct === a.id && (
                  <div className="mi-steps-text">
                    <ol>
                      {a.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    {a.source && <span className="cap">{a.source}</span>}
                    <button type="button" className="solid" disabled={a.done_today} onClick={() => void data.logActivity(a.id)}>
                      {a.done_today ? 'Done today' : 'Mark done'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'journal' && (
          <div className="mi-view" role="tabpanel">
            <span className="cap">Private journal · never shown to the ground</span>
            <form className="mi-form" onSubmit={submitNote}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="One line about today" aria-label="Journal entry" rows={3} />
              <button type="submit" className="solid" disabled={!draft.trim()}>
                Save line
              </button>
            </form>
            {data.notes.slice(0, 4).map((n) => (
              <p key={n.id} className="mi-note">
                <span className="cap">{n.t.slice(0, 10)}</span>
                {n.text}
              </p>
            ))}
          </div>
        )}

        {view === 'ask' && (
          <div className="mi-view" role="tabpanel">
            <span className="cap">Ask eˣ · prepared answers; an on-board model plugs in here</span>
            <form className="mi-form mi-ask" onSubmit={submitAsk}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="How can I sleep better?" aria-label="Question" />
              <button type="submit" className="solid" disabled={!q.trim() || asking}>
                {asking ? 'Thinking' : 'Ask'}
              </button>
            </form>
            <div className="mi-chips">
              {SUGGESTED_QUESTIONS.map((s) => (
                <button key={s} type="button" className="ghost" onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
            {reply && (
              <div className="mi-answer" data-status={reply.status}>
                <p>{reply.text}</p>
                <span className="cap">
                  {reply.by === 'prepared' ? 'Prepared answer' : 'On-board model'} · level and contact set by the rules
                  {reply.sources.length ? ` · ${reply.sources.join(', ')}` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {view === 'care' && (
          <div className="mi-view" role="tabpanel">
            <span className="cap">Care plan · isolation and confinement</span>
            {CARE.map((c) => (
              <div key={c.title} className="mi-care">
                <b>{c.title}</b>
                <p>{c.text}</p>
                {showSources && <span className="cap">{c.sources.join(', ')}</span>}
              </div>
            ))}
            <button type="button" className="ghost" aria-pressed={showSources} onClick={() => setShowSources((v) => !v)}>
              {showSources ? 'Hide sources' : 'Sources'}
            </button>
            {showSources && (
              <ul className="mi-sources">
                {[...new Set(CARE.flatMap((c) => c.sources))].map((id) => {
                  const s = sourceById(id);
                  return s ? (
                    <li key={id}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {id}: {s.title}
                      </a>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </div>
        )}
        </>
        )}
      </section>

      <div className="pat-actions mi-actions">
        <button type="button" className="solid" onClick={() => { setMore(true); setView('care'); }}>
          {read.route === 'crew-medical-officer' ? 'Call the medical officer' : 'Talk to someone'}
        </button>
        <button type="button" className="ghost" onClick={() => { setMore(true); setView('ask'); }}>
          Ask eˣ
        </button>
      </div>
    </div>
  );
}
