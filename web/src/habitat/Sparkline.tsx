import type { Anomaly, ChannelKey, HabitatData } from "./types";
import { STATUS_COLOR, scoreStatus } from "./logic";

interface Props {
  data: HabitatData; channel: ChannelKey; days: number | "all";
  width?: number; height?: number; highlightId?: string | null;
}

/** Value line + limit lines + anomaly windows + detection markers, with a score strip underneath. Plain SVG, no chart lib. */
export function Sparkline({ data, channel, days, width = 640, height = 90, highlightId }: Props) {
  const all = data.series;
  const stepsPerDay = Math.round((24 * 60) / data.meta.sample_interval_min);
  const rows = days === "all" ? all : all.slice(Math.max(0, all.length - days * stepsPerDay));
  if (rows.length < 2) return null;

  const t0 = Date.parse(rows[0].time), t1 = Date.parse(rows[rows.length - 1].time);
  const ch = data.channels[channel];
  const vals = rows.map((r) => r[channel]).filter((v): v is number => v != null);
  const lims = [ch.limits.min, ch.limits.max].filter((v): v is number => v != null);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  // Only stretch the axis to a limit if it is reasonably close, so the signal stays readable.
  for (const l of lims) { const span = hi - lo || 1; if (l > lo - span && l < hi + span) { lo = Math.min(lo, l); hi = Math.max(hi, l); } }
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;

  const stripH = 8, gap = 4, plotH = height - stripH - gap;
  const x = (iso: string) => ((Date.parse(iso) - t0) / (t1 - t0 || 1)) * width;
  const y = (v: number) => plotH - ((v - lo) / (hi - lo)) * plotH;

  let d = "", pen = false;
  for (const r of rows) {
    const v = r[channel];
    if (v == null) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${x(r.time).toFixed(1)},${y(v).toFixed(1)}`; pen = true;
  }

  const visible = (a: Anomaly) => a.channel === channel && Date.parse(a.end ?? rows[rows.length - 1].time) >= t0;
  const anoms = data.anomalies.filter(visible);
  const clampX = (iso: string) => Math.max(0, Math.min(width, x(iso)));
  const cell = width / rows.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img"
         aria-label={`${ch.label} over ${days === "all" ? "the full mission" : `the last ${days} days`}`}>
      {anoms.map((a) => (
        <rect key={a.id} x={clampX(a.start)} y={0} height={plotH}
              width={Math.max(2, clampX(a.end ?? rows[rows.length - 1].time) - clampX(a.start))}
              fill={STATUS_COLOR[a.severity]} opacity={a.id === highlightId ? 0.28 : 0.12} />
      ))}
      {lims.map((l, i) => l >= lo && l <= hi && (
        <line key={i} x1={0} x2={width} y1={y(l)} y2={y(l)} stroke="#f59e0b" strokeDasharray="6 5" strokeWidth={1.2} opacity={0.8} />
      ))}
      <path d={d} fill="none" stroke="#e2e8f0" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      {anoms.map((a) => (
        <g key={a.id + "-m"}>
          {a.detected_at && Date.parse(a.detected_at) >= t0 && (
            <line x1={x(a.detected_at)} x2={x(a.detected_at)} y1={0} y2={plotH} stroke="#f4f6fb" strokeWidth={2} />
          )}
          {a.limit_crossed_at && Date.parse(a.limit_crossed_at) >= t0 && (
            <line x1={x(a.limit_crossed_at)} x2={x(a.limit_crossed_at)} y1={0} y2={plotH} stroke="#f59e0b" strokeWidth={2} strokeDasharray="2 3" />
          )}
        </g>
      ))}
      {rows.map((r, i) => {
        const s = scoreStatus(r.score?.[channel] ?? null, data.meta.thresholds);
        return s && s !== "green"
          ? <rect key={r.time} x={i * cell} y={plotH + gap} width={Math.max(cell, 1)} height={stripH} fill={STATUS_COLOR[s]} />
          : null;
      })}
      <rect x={0} y={plotH + gap} width={width} height={stripH} fill="none" stroke="#334155" />
    </svg>
  );
}
