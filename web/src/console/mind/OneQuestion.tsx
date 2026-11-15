// One question per screen: the next unanswered check-in scale, five plain words as big buttons.
// Answering moves to the next question; when all five are answered it calls onDone.
import { SCALES, useMind, type ScaleKey } from '../../data/mind';

const ASK: Record<ScaleKey, string> = {
  mood: 'How is your mood?',
  stress: 'How stressed do you feel?',
  energy: 'How is your energy?',
  sleep_quality: 'How did you sleep?',
  social: 'How connected do you feel?',
};

export function OneQuestion({ subject, date, onDone }: { subject: string; date: string; onDone?: () => void }) {
  const mind = useMind();
  const report = mind.reports[subject]?.[date] ?? {};
  const next = SCALES.find((s) => report[s.key] == null);
  const answered = SCALES.filter((s) => report[s.key] != null).length;
  if (!next) {
    return (
      <div className="oq">
        <span className="cap">5 of 5 answered</span>
        <b className="oq-q">Thank you.</b>
        {onDone && (
          <button type="button" className="solid oq-go" onClick={onDone}>
            Continue
          </button>
        )}
      </div>
    );
  }
  const words = mind.words[next.key] ?? next.words;
  return (
    <div className="oq" key={next.key}>
      <span className="cap">Question {answered + 1} of 5</span>
      <b className="oq-q">{ASK[next.key]}</b>
      <div className="oq-opts" role="group" aria-label={ASK[next.key]}>
        {words.map((w, i) => (
          <button key={w} type="button" className="ghost oq-opt" onClick={() => mind.setScore(subject, date, next.key, i + 1)}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
