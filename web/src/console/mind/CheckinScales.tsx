// The five 1-5 self-report scales (server words when the server answers), shared by Mind and the daily check.
// Saves through data/mind (local first, queued POST api/observations).
import { SCALES, useMind, type ScaleKey } from '../../data/mind';

export function CheckinScales({ subject, date, note }: { subject: string; date: string; note?: string }) {
  const mind = useMind();
  const report = mind.reports[subject]?.[date] ?? {};
  const words = (k: ScaleKey) => mind.words[k] ?? SCALES.find((s) => s.key === k)!.words;
  const answered = SCALES.filter((s) => report[s.key] != null).length;
  return (
    <div className="mi-check" role="group" aria-label="Today's check-in">
      <span className="cap">Check-in · {answered} of 5{note ? ` · ${note}` : ''}</span>
      {SCALES.map((s) => (
        <div key={s.key} className="mi-scale">
          <span className="mi-scale-l">{s.label}</span>
          <span className="mi-steps">
            {words(s.key).map((w, i) => (
              <button
                key={w}
                type="button"
                aria-pressed={report[s.key] === i + 1}
                aria-label={`${s.label}: ${w}`}
                title={w}
                onClick={() => mind.setScore(subject, date, s.key, i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </span>
          <span className="cap mi-scale-w">{report[s.key] != null ? words(s.key)[report[s.key]! - 1] : ''}</span>
        </div>
      ))}
    </div>
  );
}
