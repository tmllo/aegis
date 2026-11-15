// "Talk it through": a short demo chat after the Mind check-in. Replies come from src/data/therapist
// (free Gemini API if a key is set on this device, otherwise a scripted demo). Escalation never
// depends on the model: the Contact surgeon button comes from the check-in scores, and risk words
// get a fixed reply.
import { useState } from 'react';
import { getKey, setKey, talk, type Turn } from '../data/therapist';
import { Btn } from './ds';

export default function MindTalk({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(!getKey());
  const [keyOpen, setKeyOpen] = useState(false);

  if (!open) return <Btn kind="secondary" onClick={() => setOpen(true)}>Talk it through</Btn>;

  const send = async () => {
    const t = text.trim();
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
    <div className="mt">
      <div className="mt-log">
        {turns.length === 0 && <p className="mt-hint">How are you feeling about today? Say it in your own words.</p>}
        {turns.map((t, i) => (
          <p key={i} className={`mt-msg is-${t.role}`}>{t.text}</p>
        ))}
        {busy && <p className="mt-msg is-model mt-wait">...</p>}
      </div>
      <form className="mt-in" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type here" aria-label="Message" />
        <Btn disabled={busy || !text.trim()} onClick={() => void send()}>Send</Btn>
      </form>
      <p className="mt-foot">
        AI demo, not medical advice. {demo ? 'Scripted replies.' : 'Replies by Gemini.'}{' '}
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
    </div>
  );
}
