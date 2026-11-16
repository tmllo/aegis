// xAI: the Mind page's own assistant. It has its own view on the Mind page (Check-in | xAI), a
// conversation that stays on this device for the day, suggested openers, and replies that write
// themselves in. Replies come from src/data/therapist: a pasted Gemini key, else the site model (Workers
// AI, no key), else a scripted offline demo; the tag in the header says which one answered. Escalation never depends on the model: risk words get a fixed
// reply, and Contact Earth support comes from the check-in scores.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getKey, setKey, talk, type Reply, type Turn } from '../data/therapist';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPENERS = ['I miss home', 'I slept badly', 'Tension with the crew', 'I feel flat today'];
const STORE = 'ex-xai-chat';

/** The day's conversation, kept on this device so switching views or pages does not lose it. */
function loadTurns(day: string): Turn[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { day: string; turns: Turn[] } | null;
    return v && v.day === day ? v.turns : [];
  } catch {
    return [];
  }
}
function saveTurns(day: string, turns: Turn[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ day, turns }));
  } catch {
    /* private mode: the chat still works, it just is not kept */
  }
}

/** Reveals the newest reply a few characters at a time, like a streamed answer. */
function Typed({ text, live, onTick }: { text: string; live: boolean; onTick: () => void }) {
  const [n, setN] = useState(live && !REDUCE ? 0 : text.length);
  useEffect(() => {
    if (n >= text.length) return;
    const id = setTimeout(() => (setN((v) => Math.min(text.length, v + 3)), onTick()), 16);
    return () => clearTimeout(id);
  }, [n, text, onTick]);
  return <>{text.slice(0, n)}</>;
}

const Mark = ({ big }: { big?: boolean }) => (
  <span className={`mt-av${big ? ' is-big' : ''}`} aria-hidden>
    e<sup>x</sup>
  </span>
);

export default function MindTalk({ today, day, name }: { today: string; day: string; name: string }) {
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(day));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [via, setVia] = useState<Reply['via'] | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const toEnd = useCallback(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, []);
  useEffect(toEnd, [turns, busy, toEnd]);
  useEffect(() => saveTurns(day, turns), [day, turns]);
  useEffect(() => input.current?.focus(), []);

  const send = async (raw = text) => {
    const t = raw.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: 'user', text: t }];
    setTurns(next);
    setText('');
    setBusy(true);
    const r = await talk(next, today);
    setTurns([...next, { role: 'model', text: r.text }]);
    setVia(r.via);
    setBusy(false);
  };

  return (
    <section className="mt is-full" aria-label="xAI assistant">
      <header className="mt-head">
        <Mark />
        <div className="mt-who">
          <b>xAI</b>
          <span>Reads today's check-in, nothing else</span>
        </div>
        <span className={`mt-model${via && via !== 'script' ? ' is-live' : ''}`}>{via === 'gemini' ? 'Gemini' : via === 'site' ? 'Live' : via === 'script' ? 'Offline demo' : getKey() ? 'Gemini' : 'Ready'}</span>
        {turns.length > 0 && (
          <button type="button" className="mt-new" onClick={() => setTurns([])}>
            New chat
          </button>
        )}
      </header>

      <div className="mt-log" ref={log} aria-live="polite">
        {turns.length === 0 ? (
          <div className="mt-empty">
            <Mark big />
            <h3>What's on your mind, {name}?</h3>
            <p>Talk it through in private. If something sounds serious, xAI points you to the Earth support team.</p>
            <div className="mt-sugg">
              {OPENERS.map((o) => (
                <button key={o} type="button" onClick={() => void send(o)}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) =>
            t.role === 'user' ? (
              <p key={i} className="mt-row is-user">
                {t.text}
              </p>
            ) : (
              <div key={i} className="mt-row is-model">
                <Mark />
                <p>
                  <Typed text={t.text} live={i === turns.length - 1} onTick={toEnd} />
                </p>
              </div>
            ),
          )
        )}
        {busy && (
          <div className="mt-row is-model">
            <Mark />
            <p className="mt-dots" aria-label="Thinking">
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
      </div>

      <form
        className="mt-in"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message xAI"
          aria-label="Message xAI"
          disabled={busy}
        />
        <button type="submit" className="mt-send" disabled={busy || !text.trim()} aria-label="Send">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
            <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <p className="mt-foot">
        AI demo, not medical advice.{' '}
        {keyOpen ? (
          <input
            className="mt-key"
            type="password"
            placeholder="Paste a free Gemini API key"
            defaultValue={getKey()}
            onBlur={(e) => {
              setKey(e.target.value);
              setKeyOpen(false);
            }}
            autoFocus
          />
        ) : (
          <button type="button" className="mt-link" onClick={() => setKeyOpen(true)}>
            {getKey() ? 'Change key' : 'Use Gemini'}
          </button>
        )}
      </p>
    </section>
  );
}
