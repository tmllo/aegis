// Tap an organ or a vital: one plain name, one status word, the reading as one big number (pairs
// such as blood pressure merged, "109 / 72"), one range bar per value with the usual band and a dot
// for today, one "your usual" line. Tap the number to change it with big steppers; saving re-scores
// at once (core/scoring through the entries store) and posts to the data core. Trend, what it is,
// in space and how to measure sit behind "Trend and details".
import { useEffect, useState } from 'react';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { statusOn } from '../core/scoring';
import type { CrewData, CrewMember, MetricKey, Status } from '../data/types';
import { saveEntry, useEntries } from './entries';
import { fmt, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS, toSteps, type Row } from './model';
import { Chart } from './ui';
import type { ComponentType } from 'react';

// 1f's shared slider (usual band, red limits, today marker, trail, edit) from ./vitals; until that
// file lands the minimal range bar and steppers below stand in (TODO: drop them once it is here)
type SliderProps = { metricKey: MetricKey; memberId: string; editable?: boolean };
const vitalsMod = Object.values(import.meta.glob<{ MetricSlider?: ComponentType<SliderProps> }>('./vitals/VitalsPanel.tsx', { eager: true }))[0];
const MetricSlider = vitalsMod?.MetricSlider ?? null;

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

/** Today's value on her usual band: one thin bar, the band shaded, a dot for today. */
function RangeBar({ r }: { r: Row }) {
  if (r.lo == null || r.hi == null || r.value == null) return null;
  const lo = Math.min(r.lo, r.value);
  const hi = Math.max(r.hi, r.value);
  const pad = (hi - lo || 1) * 0.25;
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  return (
    <span className="rbar" data-status={r.status !== 'green' ? r.status : undefined} aria-hidden>
      <i className="rbar-band" style={{ left: `${x(r.lo)}%`, width: `${x(r.hi) - x(r.lo)}%` }} />
      <i className="rbar-dot" style={{ left: `${x(r.value)}%` }} />
    </span>
  );
}

function Reading({ rows, cd, m, typed, title }: { rows: Row[]; cd: CrewData; m: CrewMember; typed: Partial<Record<MetricKey, number>>; title: string }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  useEffect(() => setEdit(false), [m.id]);
  const status = worst(rows);
  const unit = rows[0].unit;
  const step = (r: Row) => (r.digits === 0 ? 1 : r.digits === 1 ? 0.1 : 0.01);
  const open = () => {
    setDraft(rows.map((r) => (r.value != null ? String(r.value) : '')));
    setEdit(true);
  };
  const bump = (i: number, d: number) =>
    setDraft((a) => a.map((v, j) => (j === i ? (Math.round(((Number(v) || 0) + d * step(rows[i])) * 100) / 100).toFixed(rows[i].digits) : v)));
  const save = () => {
    rows.forEach((r, i) => {
      const v = Number(draft[i]?.replace(',', '.'));
      if (draft[i]?.trim() && Number.isFinite(v) && v !== r.value) saveEntry(m.id, cd.mission.today, r.k, v);
    });
    setEdit(false);
  };
  return (
    <div className="rd" data-status={status !== 'green' ? status : undefined}>
      <span className="rd-name">
        {NAME(rows.map((r) => r.k)) !== title && NAME(rows.map((r) => r.k))}
        {rows.some((r) => r.k in typed) && <small> · entered by crew</small>}
      </span>
      {MetricSlider ? (
        <>
          <b className="rd-num rd-num-static">
            {rows.map((r) => fmt(r.value, r.digits)).join(' / ')}
            <small>{unit}</small>
          </b>
          {rows.map((r) => (
            <MetricSlider key={r.k} metricKey={r.k} memberId={m.id} editable />
          ))}
        </>
      ) : edit ? (
        <form
          className="rd-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {rows.map((r, i) => (
            <span key={r.k} className="rd-step">
              <button type="button" className="ghost" aria-label={`Lower ${SHORT[r.k].toLowerCase()}`} onClick={() => bump(i, -1)}>
                -
              </button>
              <input type="number" inputMode="decimal" step="any" value={draft[i] ?? ''} autoFocus={i === 0} onChange={(e) => setDraft((a) => a.map((v, j) => (j === i ? e.target.value : v)))} aria-label={`${SHORT[r.k]} in ${r.unit}`} />
              <button type="button" className="ghost" aria-label={`Raise ${SHORT[r.k].toLowerCase()}`} onClick={() => bump(i, 1)}>
                +
              </button>
            </span>
          ))}
          <span className="rd-unit">{unit}</span>
          <span className="rd-acts">
            <button type="submit" className="solid">
              Save
            </button>
            <button type="button" className="ghost" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </span>
        </form>
      ) : (
        <button type="button" className="rd-num" aria-label={`Change ${NAME(rows.map((r) => r.k)).toLowerCase()}`} onClick={open}>
          {rows.map((r) => fmt(r.value, r.digits)).join(' / ')}
          <small>{unit}</small>
        </button>
      )}
      {!MetricSlider && (
      <span className="rd-bars">
        {rows.map((r) => (
          <RangeBar key={r.k} r={r} />
        ))}
      </span>
      )}
      {!MetricSlider && rows.some((r) => r.lo != null && r.hi != null) && (
        <span className="rd-usual">Your usual {rows.map((r) => (r.lo != null && r.hi != null ? `${fmt(r.lo, r.digits)}-${fmt(r.hi, r.digits)}` : '--')).join(' / ')}</span>
      )}
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
        <Reading key={g.map((x) => x.k).join()} rows={g} cd={cd} m={m} typed={typed} title={target ? TITLE[target] : NAME(groups[0])} />
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
