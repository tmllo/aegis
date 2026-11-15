// A scored reading (model.ts MetricRow) as a vital card: value, label, 28-day bars with the
// flagged days in colour, the person's usual range as a band.
import type { MetricKey } from '../data/types';
import { fmtV, type CrewView, type MetricRow } from './model';
import { CW_STATUS, unitOf, valOf } from './ds';
import { Vital, type VITAL_ICON } from './frame';

const ICON: Record<MetricKey, keyof typeof VITAL_ICON> = {
  hr: 'heart',
  bp_sys: 'pressure',
  bp_dia: 'pressure',
  glucose: 'sugar',
  temp: 'temp',
  sleep_h: 'sleep',
  mood: 'mood',
  exercise_min: 'run',
  bone_loss_pct: 'bone',
  dose_mSv_day: 'dose',
  dose_mSv_cum: 'dose',
};
const LABEL: Partial<Record<MetricKey, string>> = { bp_sys: 'Blood pressure', dose_mSv_day: 'Dose today', dose_mSv_cum: 'Career dose', bone_loss_pct: 'Bone loss' };

export function RowVital({ v, r, onClick, on, label }: { v: CrewView; r: MetricRow; onClick?: () => void; on?: boolean; label?: string }) {
  const bp = r.k === 'bp_sys';
  return (
    <Vital
      icon={ICON[r.k]}
      label={label ?? LABEL[r.k] ?? r.label}
      value={bp ? `${fmtV('bp_sys', r.value)}/${fmtV('bp_dia', v.rows.bp_dia.value)}` : valOf(r)}
      unit={unitOf(r)}
      s={CW_STATUS[r.cw]}
      history={r.k === 'dose_mSv_cum' ? undefined : r.history}
      lo={r.lo}
      hi={r.hi}
      onClick={onClick}
      on={on}
    />
  );
}
