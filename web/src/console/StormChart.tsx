// Storm probability over the latest flares: a teal line with diamond markers where the model
// raised a watch or warning, the two thresholds as dashed lines, a crosshair readout.
import { useRef, useState } from 'react';
import type { FlareEvent, StormMeta } from '../data/types';

export function StormChart({ events, meta, height = 160 }: { events: FlareEvent[]; meta: StormMeta; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (events.length < 2) return <p className="note">No events</p>;
  const W = 900;
  const H = height;
  const n = events.length;
  const maxP = Math.max(meta.thresholds.warning * 1.15, ...events.map((e) => e.p_storm));
  const x = (i: number) => 36 + (i / (n - 1)) * (W - 50);
  const y = (p: number) => 10 + (1 - p / maxP) * (H - 34);
  const pts = events.map((e, i) => `${x(i)},${y(e.p_storm)}`).join(' ');
  const move = (ev: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const fx = ((ev.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((fx - 36) / (W - 50)) * (n - 1)))));
  };
  const h = hover != null ? events[hover] : null;
  return (
    <div className="chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => setHover(null)} aria-hidden>
        <defs>
          <filter id="glow" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1="36" x2={W - 14} y1={y(maxP * f)} y2={y(maxP * f)} stroke="rgb(var(--ink))" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />
            <text x="30" y={y(maxP * f) + 4} textAnchor="end" className="chart-t">
              {Math.round(maxP * f * 100)}
            </text>
          </g>
        ))}
        {(['watch', 'warning'] as const).map((k) => (
          <g key={k}>
            <line x1="36" x2={W - 14} y1={y(meta.thresholds[k])} y2={y(meta.thresholds[k])} stroke={k === 'warning' ? 'rgb(var(--crit))' : 'rgb(var(--warn))'} strokeOpacity="0.55" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
            <text x={W - 16} y={y(meta.thresholds[k]) - 5} textAnchor="end" className="chart-a">
              {k === 'warning' ? 'Warning' : 'Watch'}
            </text>
          </g>
        ))}
        <polyline points={pts} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6" filter="url(#glow)" vectorEffect="non-scaling-stroke" />
        {events.map((e, i) =>
          e.alert_level !== 'none' ? (
            <rect key={e.flare_id} x={x(i) - 4} y={y(e.p_storm) - 4} width="8" height="8" transform={`rotate(45 ${x(i)} ${y(e.p_storm)})`} fill="#0e1316" stroke={e.alert_level === 'warning' ? 'rgb(var(--crit))' : 'rgb(var(--warn))'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ) : null,
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="6" y2={H - 22} stroke="rgb(var(--ink))" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="chart-t">
            {events[i].peak_time.slice(0, 10)}
          </text>
        ))}
      </svg>
      <div className="chart-read">
        {h ? (
          <>
            <span>{h.peak_time.slice(0, 16).replace('T', ' ')}</span>
            <b>{h.flare_class}</b>
            <span>p {Math.round(h.p_storm * 100)}%</span>
            <span>{h.alert_level === 'none' ? 'Quiet' : h.alert_level}</span>
          </>
        ) : (
          <span>{meta.horizon_hours} h horizon · point at the line</span>
        )}
      </div>
    </div>
  );
}
