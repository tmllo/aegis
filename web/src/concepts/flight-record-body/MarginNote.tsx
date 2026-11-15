// The margin note: one metric read against the person's own baseline band.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CrewData, CrewMember, EnvironmentId, MetricKey, Severity, Status } from '../../data/types';
import { STATUS_WORD, daysRunning, firstSentence, fmt, measureSiteOf, referenceFor, shortLabels, type Plate, type Reference } from './plates';

export function Shape({ status, size = 16 }: { status: Status; size?: number }) {
  return (
    <svg className={`fr-shape fr-shape-${status}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {status === 'green' && <circle cx="8" cy="8" r="5" />}
      {status === 'amber' && <path d="M8 1.5 15 14.5H1Z" />}
      {status === 'red' && <rect x="1.5" y="1.5" width="13" height="13" />}
    </svg>
  );
}

const DAYS = 14;
/** Chart furniture in real pixels: the chart is drawn at its measured size, so type never scales down. */
const AXIS_W = 56;
const TOP = 10;
const FOOT = 46;

function BaselineChart({
  member,
  metric,
  today,
  reference,
  status,
}: {
  member: CrewMember;
  metric: MetricKey;
  today: string;
  reference: Reference;
  status: Status;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const end = member.series.findIndex((r) => r.date === today);
  const rows = member.series.slice(Math.max(0, end - DAYS + 1), end + 1);
  const values = rows.map((r) => r[metric]);
  const present = values.filter((v): v is number => v != null);

  let chart = null;
  if (present.length && size.w > 0) {
    const plotW = size.w - AXIS_W;
    const plotH = size.h - TOP - FOOT;
    const lows = [...present, ...(reference.lo != null ? [reference.lo] : [])];
    const highs = [...present, reference.hi];
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    const pad = (max - min || 1) * 0.14;
    min -= pad;
    max += pad;
    const x = (i: number) => (rows.length > 1 ? (i / (rows.length - 1)) * (plotW - 12) + 6 : plotW / 2);
    const y = (v: number) => TOP + (1 - (v - min) / (max - min)) * plotH;
    const line = values
      .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
    const last = present[present.length - 1];
    const flagged = new Map(member.flags.filter((f) => f.metric === metric).map((f) => [f.date, f.severity as Severity]));
    const yHi = y(reference.hi);
    const yLo = reference.lo != null ? y(reference.lo) : null;
    const tickY = TOP + plotH + 12;

    chart = (
      <svg width={size.w} height={size.h} role="img" aria-label={`Last ${rows.length} days against ${reference.kind === 'band' ? 'own baseline band' : 'caution line'}`}>
        {yLo != null ? (
          <g>
            <rect className="fr-chart-band" x="0" y={yHi} width={plotW} height={yLo - yHi} />
            <line className="fr-chart-edge" x1="0" x2={plotW} y1={yHi} y2={yHi} />
            <line className="fr-chart-edge" x1="0" x2={plotW} y1={yLo} y2={yLo} />
            <text className="fr-chart-num" x={plotW + 12} y={yHi + 5}>{fmt(reference.hi, 1)}</text>
            <text className="fr-chart-num" x={plotW + 12} y={yLo + 5}>{fmt(reference.lo!, 1)}</text>
          </g>
        ) : (
          <g>
            <line className="fr-chart-threshold" x1="0" x2={plotW} y1={yHi} y2={yHi} />
            <text className="fr-chart-num" x={plotW + 12} y={yHi + 5}>{fmt(reference.hi, 1)}</text>
          </g>
        )}
        <line className="fr-chart-today" x1={x(rows.length - 1)} x2={x(rows.length - 1)} y1={TOP - 4} y2={TOP + plotH + 4} />
        <polyline className="fr-chart-line" points={line} />
        <circle className={`fr-chart-dot fr-fill-${status}`} cx={x(rows.length - 1)} cy={y(last)} r="6" />
        {rows.map((r, i) => {
          const sev = flagged.get(r.date);
          return <rect key={r.date} className={sev ? `fr-fill-${sev}` : 'fr-chart-day'} x={x(i) - 2} y={tickY} width="4" height={sev ? 12 : 6} />;
        })}
        <text className="fr-chart-cap" x="0" y={size.h - 2}>{rows.length} days</text>
        <text className="fr-chart-cap" x={plotW} y={size.h - 2} textAnchor="end">Today</text>
      </svg>
    );
  }
  return (
    <div className="fr-chart" ref={box}>
      {chart}
    </div>
  );
}

export interface MarginNoteProps {
  plate: Plate;
  metric: MetricKey;
  member: CrewMember;
  data: CrewData;
  environment: EnvironmentId;
  remeasure: boolean;
  onMetric: (m: MetricKey) => void;
}

export function MarginNote({ plate, metric, member, data, environment, remeasure, onMetric }: MarginNoteProps) {
  const meta = data.metrics[metric];
  const score = plate.scores.find((s) => s.metric === metric);
  if (!score) return null;
  const today = data.mission.today;
  const reference = referenceFor(member, metric, data, environment);
  const running = daysRunning(member, metric, today);
  const site = measureSiteOf(metric);
  const names = shortLabels(plate.scores.map((s) => s.metric), data);
  const ofLimit = metric === 'dose_mSv_cum' ? `${fmt((score.value / data.career_limit_mSv) * 100, 0)}%` : null;
  const runningText = running ? `${running} ${running === 1 ? 'day' : 'days'}` : 'In range';

  const facts: [string, string][] =
    reference.kind === 'band'
      ? [
          ['Own range', `${fmt(reference.lo!, 1)} to ${fmt(reference.hi, 1)}`],
          ['3-day mean', score.windowMean != null ? fmt(score.windowMean, 1) : 'None'],
          ['Running', runningText],
        ]
      : [
          ['Caution above', fmt(reference.hi)],
          ['Limit', reference.limit != null ? fmt(reference.limit) : 'None'],
          ofLimit ? ['Of limit', ofLimit] : ['Running', runningText],
        ];

  return (
    <div className="fr-note" key={`${plate.id}-${metric}`}>
      <p className="fr-line fr-note-head">
        <span className="fr-mono">{plate.no}</span>
        <span className="fr-label">{plate.scores.length > 1 ? `${plate.name} / ${names[metric]}` : meta.label}</span>
      </p>
      <p className="fr-line fr-hero">
        <span className="fr-hero-num">{fmt(score.value)}</span>
        <span className="fr-hero-unit">{meta.unit}</span>
        <span className={`fr-hero-status fr-text-${score.status}`}>
          <Shape status={score.status} size={20} />
          {STATUS_WORD[score.status]}
        </span>
      </p>

      {plate.scores.length > 1 && (
        <div className="fr-line fr-metrics" role="tablist" aria-label="Readings">
          {plate.scores.map((s) => (
            <button key={s.metric} role="tab" aria-selected={s.metric === metric} className="fr-metric" onClick={() => onMetric(s.metric)}>
              <span className="fr-metric-name">{names[s.metric]}</span>
              <span className="fr-metric-val">
                <Shape status={s.status} size={14} />
                {fmt(s.value)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="fr-line">
        <BaselineChart member={member} metric={metric} today={today} reference={reference} status={score.status} />
      </div>

      <dl className="fr-line fr-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {remeasure ? (
        <p className={`fr-line fr-how fr-rule-${score.status}`}>
          <span className="fr-label">{site ?? 'Re-measure'}</span>
          {meta.how_to_measure}
        </p>
      ) : (
        <p className="fr-line fr-why">
          {firstSentence(meta.explain)}
          {plate.illustrative && <span className="fr-caption">Placement illustrative</span>}
        </p>
      )}
    </div>
  );
}
