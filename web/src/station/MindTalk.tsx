// "Talk it through": a short demo chat after the Mind check-in, laid out like a built-in assistant
// (model header, typing dots, replies that write themselves in, suggested openers). Replies come from
// src/data/therapist (free Gemini API if a key is set on this device, otherwise a scripted demo).
// Escalation never depends on the model: the Contact surgeon button comes from the check-in scores,
// and risk words get a fixed reply.
import { useEffect, useRef, useState } from 'react';
import { getKey, setKey, talk, type Turn } from '../data/therapist';
import { Btn } from './ds';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPENERS = ['I miss home', 'I slept badly', 'Tension with the crew'];

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

export default function MindTalk({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(!getKey());
  const [keyOpen, setKeyOpen] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const toEnd = () => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  };
  useEffect(() => {
    toEnd();
  }, [turns, busy]);

  if (!open) return <Btn kind="secondary" onClick={() => setOpen(true)}>Talk it through</Btn>;

  const send = async (raw = text) => {
    const t = raw.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: 'user', text: t }];
    setTurns(next);
    setText('');
    setBusy(true);
    const r = await talk(next, today);
    setTurns([...next, { role: 'model', text: r.text }]);
    setDemo(r.demo);
    setBusy(false);
  };

  return (
    <section className="mt" aria-label="xAI">
      <header className="mt-head">
        <span className="mt-mark" aria-hidden>
          e<sup>x</sup>
        </span>
        <b>xAI</b>
        <span className={`mt-model${demo ? '' : ' is-live'}`}>{demo ? 'Offline demo' : 'Gemini'}</span>
      </header>

      <div className="mt-log" ref={log} aria-live="polite">
        {turns.length === 0 && (
          <div className="mt-row is-model">
            <span className="mt-av" aria-hidden>e<sup>x</sup></span>
            <p>I read today's check-in. What's on your mind?</p>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <p key={i} className="mt-row is-user">{t.text}</p>
          ) : (
            <div key={i} className="mt-row is-model">
              <span className="mt-av" aria-hidden>e<sup>x</sup></span>
              <p>
                <Typed text={t.text} live={i === turns.length - 1} onTick={toEnd} />
              </p>
            </div>
          ),
        )}
        {busy && (
          <div className="mt-row is-model">
            <span className="mt-av" aria-hidden>e<sup>x</sup></span>
            <p className="mt-dots" aria-label="Thinking"><i /><i /><i /></p>
          </div>
        )}
      </div>

      {turns.length === 0 && (
        <div className="mt-sugg">
          {OPENERS.map((o) => (
            <button key={o} type="button" onClick={() => void send(o)}>{o}</button>
          ))}
        </div>
      )}

      <form className="mt-in" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message xAI" aria-label="Message" disabled={busy} />
        <button type="submit" className="mt-send" disabled={busy || !text.trim()} aria-label="Send">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </form>

      <p className="mt-foot">
        AI demo, not medical advice. Risk words always go to the flight surgeon.{' '}
        {keyOpen ? (
          <input
            className="mt-key"
            type="password"
            placeholder="Paste a free Gemini API key"
            defaultValue={getKey()}
            onBlur={(e) => { setKey(e.target.value); setDemo(!e.target.value); setKeyOpen(false); }}
            autoFocus
          />
        ) : (
          <button type="button" className="mt-link" onClick={() => setKeyOpen(true)}>{getKey() ? 'Change key' : 'Use Gemini'}</button>
        )}
      </p>
    </section>
  );
}
