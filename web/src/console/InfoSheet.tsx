// Tap a vital or an organ: a plain explanation. What it is, why it changes in space, how to
// measure it in three steps, what to do now, and the mission trend against her own band.
import { TARGETS, type TargetId } from '../components/body3d/targets';
import type { CrewData, CrewMember } from '../data/types';
import { fmt, rowOf, STATUS_WORD, TARGET_METRICS, type Row } from './model';
import { statusOn } from '../core/scoring';
import { useState } from 'react';
import { Band } from './ui';
import { Chart, Mark } from './ui';

export function InfoSheet({ r, target, cd, m, onClose }: { r: Row; target: TargetId | null; cd: CrewData; m: CrewMember; onClose: () => void }) {
  const meta = cd.metrics[r.k];
  const steps = meta.how_to_measure.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 3);
  const i = m.series.findIndex((x) => x.date === cd.mission.today);
  const series = m.series.slice(0, i + 1);
  const flagDays = new Set(m.flags.filter((f) => f.metric === r.k).map((f) => f.date));
  const [deep, setDeep] = useState(false);
  const scores = statusOn(m, cd).scores;
  const organ = target ? TARGET_METRICS[target].map((k) => rowOf(cd, m, scores, k)) : [r];
  return (
    <aside className="sheet brk" aria-label={meta.label}>
      <button type="button" className="ghost sheet-close" onClick={onClose}>
        Close
      </button>
      <span className="cap">{target ? (target === 'dna' ? 'Whole body' : TARGETS[target].label) : 'Vital'}</span>
      <h2 className="sheet-title">{meta.label}</h2>
      <span className="sheet-now" data-status={r.status}>
        <Mark s={r.status} size={10} /> {fmt(r.value, r.digits)} {r.unit} · {STATUS_WORD[r.status]}
        {r.mean != null && <small> · your usual {fmt(r.lo, r.digits)}-{fmt(r.hi, r.digits)}</small>}
      </span>
      {organ.map((o) => (
        <div key={o.k} className="sheet-row" data-status={o.status}>
          <span className="cap">
            {o.label} · {STATUS_WORD[o.status]}
          </span>
          <b className="sheet-num">
            {fmt(o.value, o.digits)} <small>{o.unit}</small>
          </b>
          <Band g={o} />
          <span className="cap">
            Your usual {fmt(o.mean, o.digits)}{o.lo != null && o.hi != null ? ` · range ${fmt(o.lo, o.digits)}-${fmt(o.hi, o.digits)}` : ''}
          </span>
        </div>
      ))}
      <button type="button" className="ghost" aria-pressed={deep} onClick={() => setDeep((d) => !d)}>
        {deep ? 'Less' : 'Deeper'}
      </button>
      {deep && (
        <span className="cap">
          z-score {r.z == null ? '--' : `${r.z >= 0 ? '+' : '-'}${Math.abs(r.z).toFixed(1)}`} · {r.running} days running · {m.flags.filter((f) => f.metric === r.k).length} flags this mission
        </span>
      )}
      <div className="sheet-chart">
        <Chart values={series.map((x) => x[r.k])} dates={series.map((x) => x.date)} flagged={series.map((x) => flagDays.has(x.date))} g={r} height={150} />
      </div>
      <h3 className="cap">What it is</h3>
      <p>{meta.explain}</p>
      {target && (
        <>
          <h3 className="cap">In space</h3>
          <p>{TARGETS[target].space}</p>
        </>
      )}
      <h3 className="cap">How to measure</h3>
      <ol>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <h3 className="cap">What to do now</h3>
      <p>{r.action}</p>
    </aside>
  );
}
