// Compare: every crew member's body side by side with the same metric lit on each, so the one
// who drifts first stands out. Tap a metric to switch. Values from crew_data via core/scoring.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TargetId } from '../components/body3d/targets';
import type { MetricKey, Status } from '../data/types';
import { fmt, METRIC_TARGET, RANK, rowOf, SHORT, STATUS_WORD } from './model';
import { Band, Mark, Panel } from './ui';
import { useConsole } from './useConsole';
import { useHud } from './hud';

const METRICS: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];

export default function ComparePage() {
  const { cd, views, seat, setCrew } = useConsole();
  const setCompare = useHud((s) => s.setCompare);
  const nav = useNavigate();
  // start on the metric that is worst across the crew
  const first = useMemo(() => {
    let best: { k: MetricKey; s: number } = { k: 'hr', s: -1 };
    for (const v of views) for (const sc of v.scores) {
      const s = RANK[sc.status] * 10 + Math.abs(sc.score ?? 0);
      if (s > best.s && METRICS.includes(sc.metric)) best = { k: sc.metric, s };
    }
    return best.k;
  }, [views]);
  const [k, setK] = useState<MetricKey | null>(null);
  const metric = k ?? first;
  const rows = useMemo(() => (cd ? views.map((v) => rowOf(cd, v.m, v.scores, metric)) : []), [cd, views, metric]);

  useEffect(() => {
    const t = METRIC_TARGET[metric] as TargetId | undefined;
    setCompare(rows.map((r) => (t ? ({ [t]: r.status === 'green' ? 'green' : r.status } as Partial<Record<TargetId, Status>>) : {})));
  }, [rows, metric, setCompare]);
  useEffect(() => () => setCompare([]), [setCompare]);

  if (!cd || !views.length) return <p className="cx-error cx-wait">Loading</p>;
  const drift = rows.reduce((w, r, i) => (Math.abs(r.z ?? 0) > Math.abs(rows[w].z ?? 0) ? i : w), 0);

  return (
    <>
      <Panel label="Metric" icon="list" aside={SHORT[metric]} className="cp-left">
        <div className="steps">
          {METRICS.map((m, i) => {
            const worst = views.map((v) => v.scores.find((s) => s.metric === m)?.status ?? 'green').reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'green');
            return (
              <button key={m} type="button" className="step" data-status={worst} aria-pressed={m === metric} onClick={() => setK(m)}>
                <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
                <Mark s={worst} />
                <span className="step-t">{SHORT[m]}</span>
                <span className="step-v">
                  <em>{STATUS_WORD[worst]}</em>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="cp-cards">
        {views.map((v, i) => {
          const r = rows[i];
          return (
            <button key={v.m.id} type="button" className="wg wg-std cp-card" data-status={r.status} onClick={() => { setCrew(v.m.id); nav(METRIC_TARGET[metric] ? `/vitals?t=${METRIC_TARGET[metric]}&k=${metric}` : '/vitals'); }}>
              <span className="wg-head">
                <span className="wg-l">
                  {seat[v.m.id]} {i === drift && Math.abs(r.z ?? 0) >= 1 ? '· drifts most' : ''}
                </span>
                <Mark s={r.status} size={10} />
              </span>
              <span className="wg-row">
                <b style={{ fontSize: 34, color: r.status !== 'green' ? `rgb(var(--${r.status === 'red' ? 'crit' : 'warn'}))` : undefined }}>{fmt(r.value, r.digits)}</b>
                <small>{r.unit}</small>
                <span className="wg-meta">z {r.z == null ? '--' : r.z.toFixed(1)}</span>
              </span>
              <Band g={r} />
              <span className="wg-meta" style={{ marginLeft: 0 }}>
                usual {fmt(r.mean, r.digits)} · {r.running} d flagged
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
