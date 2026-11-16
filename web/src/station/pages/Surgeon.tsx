// Earth support team (route /surgeon): when a result goes to the crew and when to Earth (a challenge question).
// Emile, 16 Nov: message style, easy to follow. Left: who acts at each class, the current one marked.
// Centre: a message thread with Earth (same look as the xAI chat). The note is prefilled in plain words from
// the readings and stays editable; what is attached is listed under it. Sending queues it behind the signal
// delay, then it shows as delivered and Earth acknowledges. Right: the readings that go with it.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CW_LABEL, CW_RANK, LINK_DELAY, MOOD_WORD, RANK, dutyOf, issueLine, useStationData, type CW, type CrewView } from '../model';
import { Btn, CW_STATUS, roleOf } from '../ds';
import { Check, Page, SideCap } from '../frame';
import { RowVital } from '../vitals';
import { useStation } from '../state';
import { cue } from '../ui';
import '../mind.css'; // the chat card styles (shared with the xAI chat)

/** Who acts at each class (docs/ARCHITECTURE.md section 3), highest first. A label only: no alarm is raised here. */
const WHO: Partial<Record<CW, string>> = {
  emergency: 'All crew, now',
  warning: 'Earth support, now',
  caution: 'Crew re-checks today',
  advisory: 'You, self-care',
};
const LADDER = (Object.keys(WHO) as CW[]).sort((a, b) => CW_RANK[b] - CW_RANK[a]);
const DUTY = { cleared: 'I am cleared for EVA.', restricted: 'I will re-check before any EVA.', hold: 'I am holding EVA and safety-critical tasks.', shelter: 'I am in the storm shelter.' } as const;
const ATTACH = ['28-day trends', 'Personal baselines', "Today's check-in"];

/** The note in the astronaut's own voice: what is off, how I feel, what I am doing, what I ask. */
function draft(v: CrewView): string {
  const today = v.m.series[v.m.series.length - 1];
  const lines = [
    ...(v.issues.length ? v.issues.slice(0, 3).map((r) => `${issueLine(r)}.`) : ['All my readings are inside my usual range.']),
    today?.mood ? `Mood ${today.mood}/5 (${(MOOD_WORD[today.mood] || '').toLowerCase()}).` : '',
    DUTY[dutyOf(v.cw, false)],
    v.issue ? 'Asking for your review and advice.' : 'No action needed, for the record.',
  ];
  return lines.filter(Boolean).join('\n');
}

type Msg = { id: number; from: 'me' | 'earth'; text: string; state?: 'queued' | 'delivered'; at: string };
const hhmm = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** One-way delay in ms for the simulated link (Moon ~1.3 s; Mars minutes, shortened for the demo). */
const DELAY_MS: Record<string, number> = { iss: 800, moon: 1300, transit: 4000, mars: 6000 };

function EarthMark() {
  return (
    <span className="mt-av es-mark" aria-hidden>
      <svg viewBox="0 0 20 20" width="16" height="16">
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.9 10h14.2M10 2.75c2.2 2 3.2 4.4 3.2 7.25S12.2 15.25 10 17.25M10 2.75C7.8 4.75 6.8 7.15 6.8 10s1 5.25 3.2 7.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

export default function Surgeon() {
  const { data, views, env } = useStationData();
  const [qs, setQs] = useSearchParams();
  const nav = useNavigate();
  const call = useStation((s) => s.callSurgeon);
  const toast = useStation((s) => s.toast);
  const sound = useStation((s) => s.sound);
  const me = useStation((s) => s.me);
  const shared = useStation((s) => s.shared);
  const medic = me === 'medic';
  const visible = medic ? views.filter((x) => shared[x.m.id] !== false) : views.filter((x) => x.m.id === me);
  const v = visible.find((x) => x.m.id === qs.get('c')) ?? [...visible].sort((a, b) => RANK[b.overall] - RANK[a.overall])[0];
  const [note, setNote] = useState(() => (v ? draft(v) : ''));
  const [thread, setThread] = useState<Msg[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    if (v) setNote(draft(v));
    setThread([]);
  }, [v?.m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [thread]);
  if (!data) return null;
  if (!v) return <Page title="Earth support team" sub="Nobody has shared with the medic." />;

  const delay = DELAY_MS[env] ?? 1300;
  const send = () => {
    const text = note.trim();
    if (!text) return;
    const id = Date.now();
    call(v.m.id);
    cue('chime', sound);
    setThread((t) => [...t, { id, from: 'me', text, state: 'queued', at: hhmm() }]);
    setNote('');
    toast({ tone: 'info', title: 'Sent to the Earth support team', body: `With trends and baselines. Signal delay ${LINK_DELAY[env]}.` });
    timers.current.push(
      window.setTimeout(() => setThread((t) => t.map((m) => (m.id === id ? { ...m, state: 'delivered' } : m))), delay),
      window.setTimeout(
        () =>
          setThread((t) => [
            ...t,
            {
              id: id + 1,
              from: 'earth',
              at: hhmm(),
              text: v.cw === 'warning' || v.cw === 'emergency' ? 'Received. Our doctor is reviewing your data now and will call you on the private line within the hour. Keep the hold until then.' : 'Received, thank you. Nothing urgent in your data. Keep logging; we will look again at tomorrow’s check-in.',
            },
          ]),
        delay * 2 + 2200,
      ),
    );
  };

  return (
    <Page
      title="Earth support team"
      sub={`Private line · signal delay ${LINK_DELAY[env]}`}
      left={
        <>
          <p className="fr-cap">Who acts</p>
          {LADDER.map((cw) => (
            <Check key={cw} s={CW_STATUS[cw]} title={CW_LABEL[cw]} word={WHO[cw]!} on={cw === v.cw} />
          ))}
        </>
      }
      object={
        <section className="mt is-full es" aria-label="Messages with the Earth support team">
          <header className="mt-head">
            <EarthMark />
            <div className="mt-who">
              <b>Earth support team</b>
              <span>{medic ? `About ${roleOf(v.m)}` : 'Only you and Earth see this'}</span>
            </div>
            <span className="mt-model is-live">Link up</span>
          </header>

          <div className="mt-log es-log" ref={log} aria-live="polite">
            {thread.length === 0 ? (
              <p className="es-empty">Your note is ready below. Read it, change anything, then send.</p>
            ) : (
              thread.map((m) =>
                m.from === 'me' ? (
                  <div key={m.id} className="es-out">
                    <p className="mt-row is-user">{m.text}</p>
                    <small className={m.state === 'delivered' ? 'is-done' : ''}>
                      {m.at} · {m.state === 'delivered' ? 'Delivered' : `Sending, ${LINK_DELAY[env]} delay`}
                    </small>
                  </div>
                ) : (
                  <div key={m.id} className="mt-row is-model">
                    <EarthMark />
                    <p>{m.text}</p>
                  </div>
                ),
              )
            )}
          </div>

          <div className="es-compose">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={thread.length ? 2 : 5} aria-label="Note to the Earth support team" placeholder="Write to the Earth support team" />
            <ul className="es-attach" aria-label="Attached">
              {ATTACH.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>
      }
      right={
        <>
          <SideCap>Goes with the note</SideCap>
          {(v.issues.length ? v.issues.slice(0, 3) : [v.rows.sleep_h, v.rows.mood, v.rows.hr].filter(Boolean)).map((r) => (
            <RowVital key={r.k} v={v} r={r} />
          ))}
        </>
      }
      footLeft={
        medic && visible.length > 1 ? (
          <div className="fr-seg" role="tablist" aria-label="Crew member">
            {visible.map((x) => (
              <button key={x.m.id} type="button" role="tab" aria-selected={x.m.id === v.m.id} className={x.m.id === v.m.id ? 'is-on' : ''} onClick={() => (cue('tick', sound), setQs({ c: x.m.id }, { replace: true }))}>
                {roleOf(x.m)}
              </button>
            ))}
          </div>
        ) : (
          <Btn kind="secondary" onClick={() => nav('/')}>
            My health
          </Btn>
        )
      }
      footRight={
        <Btn kind={v.cw === 'warning' ? 'danger' : 'primary'} onClick={send} disabled={!note.trim()}>
          Send to Earth support
        </Btn>
      }
    />
  );
}
