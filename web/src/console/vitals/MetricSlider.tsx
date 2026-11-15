// One metric as a slider: her usual band (mean ± 2 sd), the red limits, a 14-day trail of dots and
// today's value as the thumb. Tap the value to edit: big - / + steppers, a typed input, Save / Cancel.
// Save puts the value in useEntries (the whole app re-scores) and stores it on the server as
// "entered by crew". Reads everything from useConsole, so it only needs the metric and member.
import { useMemo, useState } from 'react';
import type { MetricKey, Status } from '../../data/types';
import { postMeasure } from '../../data/live';
import { useEntries } from '../entries';
import { useConsole } from '../useConsole';

/** Server metric key for each crew_data key (server/catalog/metrics.yaml). */
const SERVER_KEY: Partial<Record<MetricKey, string>> = {
  hr: 'vital.hr',
  bp_sys: 'vital.bp_sys',
  bp_dia: 'vital.bp_dia',
  glucose: 'lab.glucose',
  temp: 'vital.temp',
  sleep_h: 'self.sleep_h',
  mood: 'self.mood',
  exercise_min: 'self.exercise_min',
};
/** Step for the - / + buttons. */
const STEP: Partial<Record<MetricKey, number>> = { temp: 0.1, sleep_h: 0.1, mood: 1, bone_loss_pct: 0.1, dose_mSv_day: 0.01, dose_mSv_cum: 1 };
const WORD: Record<Status, string> = { green: 'Usual', amber: 'Watch', red: 'Act now' };

export interface MetricSliderProps {
  metricKey: MetricKey;
  memberId?: string;
  editable?: boolean;
}

export function MetricSlider({ metricKey: k, memberId, editable = true }: MetricSliderProps) {
  const { cd, views, cv } = useConsole();
  const view = (memberId ? views.find((v) => v.m.id === memberId) : cv) ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const model = useMemo(() => {
    if (!cd || !view) return null;
    const meta = cd.metrics[k];
    const m = view.m;
    const i = m.series.findIndex((r) => r.date === cd.mission.today);
    const trail = m.series.slice(Math.max(0, i - 13), i + 1).map((r) => r[k] as number | null);
    const value = i >= 0 ? (m.series[i][k] as number | null) : null;
    const b = m.baseline[k];
    const lo = b ? b.mean - 2 * b.sd : null;
    const hi = b ? b.mean + 2 * b.sd : null;
    const red = meta?.absolute_red;
    const career = k === 'dose_mSv_cum' ? cd.career_limit_mSv : null;
    const nums = [value, lo, hi, ...trail].filter((x): x is number => x != null);
    // track range: around her values, and the red limit when it is near
    let min = Math.min(...nums);
    let max = Math.max(...nums);
    const pad = Math.max((max - min) * 0.35, b ? b.sd * 2 : 1);
    min -= pad;
    max += pad;
    if (red && red.min > min - pad * 2) min = Math.min(min, red.min);
    if (red && red.max < max + pad * 2) max = Math.max(max, red.max);
    if (career) { min = 0; max = career; }
    if (k === 'mood') { min = 1; max = 5; }
    const status: Status = view.scores.find((s) => s.metric === k)?.status ?? 'green';
    const digits = k === 'temp' || k === 'sleep_h' || k === 'bone_loss_pct' ? 1 : k.startsWith('dose') ? 2 : 0;
    return { meta, value, lo, hi, red, min, max, trail, status, digits, career, date: cd.mission.today, id: m.id };
  }, [cd, view, k]);

  if (!model || !model.meta) return null;
  const { meta, value, lo, hi, red, min, max, trail, status, digits, career } = model;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  const step = STEP[k] ?? 1;
  const canEdit = editable && !!SERVER_KEY[k];

  const open = () => {
    if (!canEdit) return;
    setDraft(value != null ? value.toFixed(digits) : '');
    setEditing(true);
    setSaved(null);
  };
  const bump = (d: number) => {
    const n = Number.parseFloat(draft);
    const base = Number.isFinite(n) ? n : value ?? 0;
    setDraft((Math.round((base + d) / step) * step).toFixed(digits));
  };
  const save = async () => {
    const n = Number.parseFloat(draft);
    if (!Number.isFinite(n)) return;
    useEntries.getState().put(model.id, model.date, k, n);
    setEditing(false);
    setSaved('Saved · entered by crew');
    const key = SERVER_KEY[k];
    if (key) {
      const reply = await postMeasure(model.id, key, `${model.date}T${new Date().toISOString().slice(11, 19)}Z`, n);
      setSaved(reply ? 'Saved to her log · entered by crew' : 'Saved on this device · entered by crew');
    }
  };

  return (
    <div className="vs" data-status={status}>
      <div className="vs-head">
        <span className="vs-label">{meta.label}</span>
        <span className="vs-word">{WORD[status]}</span>
        <button type="button" className="vs-value" onClick={open} disabled={!canEdit} aria-label={`${meta.label}: ${value ?? 'no data'} ${meta.unit}${canEdit ? ', edit' : ''}`}>
          {value != null ? value.toFixed(digits) : 'No data'}
          <small>{meta.unit}</small>
        </button>
      </div>

      <div className="vs-track" aria-hidden>
        {red && red.min > min && <i className="vs-red" style={{ left: 0, width: pos(red.min) }} />}
        {red && red.max < max && <i className="vs-red" style={{ left: pos(red.max), right: 0 }} />}
        {lo != null && hi != null && <i className="vs-band" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />}
        {trail.map((v, j) => (v == null ? null : <i key={j} className="vs-trail" style={{ left: pos(v), opacity: 0.15 + (j / trail.length) * 0.6 }} />))}
        {value != null && <i className="vs-thumb" style={{ left: pos(value) }} />}
      </div>
      <div className="vs-scale">
        <span>{career ? '0' : lo != null ? `usual ${lo.toFixed(digits)}–${hi!.toFixed(digits)}` : 'no personal baseline'}</span>
        <span>{career ? `career limit ${career} mSv` : red ? `red below ${red.min} / above ${red.max}` : ''}</span>
      </div>
      {saved && !editing && <span className="vs-saved">{saved}</span>}

      {editing && (
        <form
          className="vs-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <button type="button" className="vs-step" onClick={() => bump(-step)} aria-label="Lower">
            −
          </button>
          <input inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`${meta.label} in ${meta.unit}`} autoFocus />
          <button type="button" className="vs-step" onClick={() => bump(step)} aria-label="Higher">
            +
          </button>
          <button type="submit" className="solid vs-save" disabled={!Number.isFinite(Number.parseFloat(draft))}>
            Save
          </button>
          <button type="button" className="ghost vs-save" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
