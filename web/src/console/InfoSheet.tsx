// Tap an organ or a vital: one plain name, one status word, the reading as one big number (pairs
// such as blood pressure merged, "109 / 72") and 1f's MetricSlider per value (usual band, limits,
// today, edit; saving re-scores at once through the entries store and posts to the data core).
// Trend, what it is, in space and how to measure sit behind "Trend and details".
import { useState } from 'react';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { statusOn } from '../core/scoring';
import type { CrewData, CrewMember, MetricKey, Status } from '../data/types';
import { useEntries } from './entries';
import { fmt, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS, toSteps, type Row } from './model';
import { Chart } from './ui';
import { MetricSlider } from './vitals';

/** Plain name of each body part, and its readings (a pair is one reading). */
const TITLE: Record<TargetId, string> = { heart: 'Heart', vessels: 'Blood pressure', brain: 'Brain', bone: 'Bones', muscle: 'Muscles', metabolic: 'Blood sugar', dna: 'Whole body' };
const READINGS: Record<TargetId, MetricKey[][]> = {
  heart: [['hr'], ['bp_sys', 'bp_dia']],
  vessels: [['bp_sys', 'bp_dia']],
  brain: [['sleep_h'], ['mood']],
  bone: [['bone_loss_pct'], ['exercise_min']],
  muscle: [['exercise_min']],
  metabolic: [['glucose']],
  dna: [['dose_mSv_day'], ['temp']],
};
const NAME = (ks: MetricKey[]) => (ks.length === 2 && ks[0] === 'bp_sys' ? 'Blood pressure' : SHORT[ks[0]]);
const worst = (rows: Row[]) => rows.reduce<Status>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), 'green');

/** One reading: its value (a pair merged, "109 / 72 mmHg") and one shared slider per value for
 *  the usual band, limits, today and editing (1f's MetricSlider: saves through the entries store). */
function Reading({ rows, m, typed, title }: { rows: Row[]; m: CrewMember; typed: Partial<Record<MetricKey, number>>; title: string }) {
  const status = worst(rows);
  const name = NAME(rows.map((r) => r.k));
  return (
    <div className="rd" data-status={status !== 'green' ? status : undefined}>
      <span className="rd-name">
        {name !== title && name}
        {rows.some((r) => r.k in typed) && <small>{name !== title ? ' · ' : ''}entered by crew</small>}
      </span>
      <b className="rd-num rd-num-static">
        {rows.map((r) => fmt(r.value, r.digits)).join(' / ')}
        <small>{rows[0].unit}</small>
      </b>
      {rows.map((r) => (
        <MetricSlider key={r.k} metricKey={r.k} memberId={m.id} editable />
      ))}
    </div>
  );
}

export function InfoSheet({ r, target, cd, m, onClose }: { r: Row; target: TargetId | null; cd: CrewData; m: CrewMember; onClose: () => void }) {
  const [more, setMore] = useState(false);
  const typed = useEntries((s) => s.byMember[m.id]?.[cd.mission.today]) ?? {};
  const scores = statusOn(m, cd).scores;
  const groups: MetricKey[][] = target ? READINGS[target] : r.k === 'bp_sys' || r.k === 'bp_dia' ? [['bp_sys', 'bp_dia']] : [[r.k]];
  const rows = groups.map((g) => g.map((k) => rowOf(cd, m, scores, k)));
  const flat = rows.flat();
  const status = worst(flat);
  const top = [...flat].sort((a, b) => RANK[b.status] - RANK[a.status])[0];
  const i = m.series.findIndex((x) => x.date === cd.mission.today);
  const series = m.series.slice(0, i + 1);
  const keys = target ? TARGET_METRICS[target] : groups[0];
  return (
    <aside className="sheet" data-status={status !== 'green' ? status : undefined} aria-label={target ? TITLE[target] : SHORT[r.k]}>
      <button type="button" className="one-more sheet-close" onClick={onClose}>
        Close
      </button>
      <h2 className="sheet-title">{target ? TITLE[target] : NAME(groups[0])}</h2>
      <b className="sheet-word">{STATUS_WORD[status]}</b>
      {rows.map((g) => (
        <Reading key={g.map((x) => x.k).join()} rows={g} m={m} typed={typed} title={target ? TITLE[target] : NAME(groups[0])} />
      ))}
      {status !== 'green' && top && (
        <div className="sheet-do">
          <h3>What to do now</h3>
          <ol className="crew-steps">
            {toSteps(top.action).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <button type="button" className="one-more" aria-expanded={more} onClick={() => setMore((x) => !x)}>
        {more ? 'Hide trend and details' : 'Trend and details'}
      </button>
      {more && (
        <div className="one-details">
          {keys.map((k) => {
            const row = flat.find((x) => x.k === k) ?? rowOf(cd, m, scores, k);
            const flagDays = new Set(m.flags.filter((f) => f.metric === k).map((f) => f.date));
            return (
              <div key={k} className="sheet-chart">
                <span className="cap">
                  {SHORT[k]} this mission · {row.running} days flagged in a row · {m.flags.filter((f) => f.metric === k).length} flags in total
                </span>
                <Chart values={series.map((x) => x[k])} dates={series.map((x) => x.date)} flagged={series.map((x) => flagDays.has(x.date))} g={row} height={130} />
              </div>
            );
          })}
          <h3>What it is</h3>
          <p>{cd.metrics[top?.k ?? r.k].explain}</p>
          {target && (
            <>
              <h3>In space</h3>
              <p>{TARGETS[target].space}</p>
            </>
          )}
          <h3>How to measure</h3>
          <ol>
            {toSteps(cd.metrics[top?.k ?? r.k].how_to_measure).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
