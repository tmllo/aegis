// SYSTEMS: four steps, Sensors -> e^x -> Crew -> Ground, with counts from the data, and one
// proof line from the storm model's test scores. The sources sit behind one button.
import { useEffect, useState } from 'react';
import { getSources, refreshSources, type SourceState } from '../data/live';
import { PLACEMENTS } from './model';
import { useConsole } from './useConsole';

const NAMES: Record<string, string> = { sim_crew: 'Crew sensors', ml_forecast: 'Storm model', osdr: 'Inspiration4 labs', isslive: 'ISS cabin', mind_sim: 'Self-report', checkin: 'Check-ins' };
const WORD: Record<string, string> = { live: 'Live', recorded: 'Recorded', simulated: 'Simulated', exported: 'Recorded', 'offline-sample': 'Recorded' };

export default function SystemsPage() {
  const { data, views } = useConsole();
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<Record<string, SourceState> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) void getSources().then(setSrc);
  }, [open]);
  if (!data) return <p className="cx-error cx-wait">Loading</p>;

  const checks = views.reduce((n, v) => n + v.scores.length, 0);
  const m = data.storm.meta.metrics_test;
  const caught = Math.round(m.hit_rate * m.n_storms);
  const crewShown = views.reduce((n, v) => n + v.scores.filter((s) => s.status !== 'green').length, 0);
  const flagged = views.reduce((n, v) => n + v.scores.filter((s) => s.status === 'red').length, 0);
  const rows: [string, string, string][] = src
    ? Object.entries(src).map(([k, s]) => [k === 'ml_forecast' ? `${NAMES[k]} · ${data.storm.meta.model}` : NAMES[k] ?? k, WORD[s.quality] ?? s.quality, s.at.slice(11, 16) + ' UTC'])
    : [...PLACEMENTS.map((p): [string, string, string] => [p.name, p.id === 'cabin' ? 'Recorded' : 'Simulated', '']), [`Storm model · ${data.storm.meta.model}`, 'Recorded', '']];

  return (
    <>
      <i className="safe safe-left" aria-hidden />
      <section className="pat sys-left">
        <span className="cap">How readings reach you</span>
        <b className="pat-word">{checks} readings checked today</b>
        <span className="cap pat-line">
          {PLACEMENTS.length} sensors · {checks} readings checked · {crewShown} shown to the crew · {flagged} sent to Earth
        </span>
        <span className="cap">
          Storm forecast warned before {caught} of {m.n_storms} storms
        </span>
      </section>

      {open && (
        <section className="pat sys-src brk">
          <span className="cap">Data sources · {src ? 'server' : 'this device'}</span>
          <table className="tbl">
            <tbody>
              {rows.map(([name, word, at]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{word}</td>
                  <td className="num">{at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="pat-actions">
        <button type="button" className="ghost" aria-pressed={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide data sources' : 'Data sources'}
        </button>
        {open && src && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await refreshSources();
              setSrc(await getSources());
              setBusy(false);
            }}
          >
            {busy ? 'Refreshing' : 'Refresh'}
          </button>
        )}
      </div>
    </>
  );
}
