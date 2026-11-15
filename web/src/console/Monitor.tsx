// Bedside-monitor pieces for Crew: the vitals column (HR, BP, SpO2, Temp, Resp tiles) and the
// alarm strip. Live values come from the simulated wrist band (labelled), the camera scan when
// one ran, and the daily crew data (Bio-Monitor, simulated). Nothing here is invented: a tile
// with no source says "Not connected".
import { useEffect, useRef, useState } from 'react';
import type { MetricKey, Status } from '../data/types';
import type { Wristband } from '../wearable';
import { fmt, type Row } from './model';
import { Mark } from './ui';

export interface Tile {
  id: string;
  label: string;
  value: string;
  unit: string;
  usual: string | null;
  status: Status | null;
  source: string;
  trace: number[] | 'ecg' | null;
  metric?: MetricKey;
  extra?: string;
}

/** A gentle ECG-like trace that scrolls at the current heart rate. */
function Ecg({ bpm }: { bpm: number }) {
  const W = 240;
  const beats = 4;
  const period = W / beats;
  let d = '';
  for (let b = 0; b <= beats; b++) {
    const x = b * period;
    d += `${b === 0 ? 'M' : 'L'}${x} 14 L${x + period * 0.35} 14 L${x + period * 0.4} 12 L${x + period * 0.45} 14 L${x + period * 0.5} 3 L${x + period * 0.55} 24 L${x + period * 0.6} 14 L${x + period * 0.75} 13 L${x + period * 0.82} 11 L${x + period * 0.9} 14 `;
  }
  return (
    <svg viewBox={`0 0 ${W / 2} 28`} className="tile-trace" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" style={{ animationDuration: `${(60 / Math.max(30, bpm)) * 1}s`, ['--shift' as string]: `-${period}px` }} className="ecg" />
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  const v = values.slice(-40);
  if (v.length < 2) return <span className="tile-trace" />;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 120},${26 - ((x - lo) / (hi - lo || 1)) * 22}`).join(' ');
  return (
    <svg viewBox="0 0 120 28" className="tile-trace" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function VitalsColumn({ tiles, active, onPick, hr }: { tiles: Tile[]; active: string | null; onPick: (t: Tile) => void; hr: number | null }) {
  return (
    <div className="vitals" aria-label="Vitals">
      {tiles.map((t) => (
        <button key={t.id} type="button" className="tile" data-status={t.status && t.status !== 'green' ? t.status : undefined} aria-pressed={active === t.id} onClick={() => onPick(t)}>
          <span className="tile-head">
            <span>{t.label}</span>
            {t.status && t.status !== 'green' && <Mark s={t.status} size={9} />}
          </span>
          <span className="tile-num">
            {t.value}
            <small>{t.unit}</small>
            {t.extra && <em>{t.extra}</em>}
          </span>
          {t.trace === 'ecg' && hr ? <Ecg bpm={hr} /> : Array.isArray(t.trace) ? <Spark values={t.trace} /> : <span className="tile-trace" />}
          <span className="tile-foot">
            <span>{t.usual ?? ' '}</span>
            <span>{t.source}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Keeps the last n values of a live number. */
export function useHistory(v: number | null | undefined, n = 40): number[] {
  const [h, setH] = useState<number[]>([]);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (v == null || v === last.current) return;
    last.current = v;
    setH((x) => [...x.slice(-(n - 1)), v]);
  }, [v, n]);
  return h;
}

export const usualOf = (r: Row | undefined) => (r && r.lo != null && r.hi != null ? `usual ${fmt(r.lo, r.digits)}-${fmt(r.hi, r.digits)}` : null);

export interface Alarm {
  id: string;
  status: Status;
  text: string;
  since: string;
}

export function AlarmStrip({ alarms, acked, onAck }: { alarms: Alarm[]; acked: Record<string, boolean>; onAck: (id: string) => void }) {
  if (!alarms.length) return null;
  return (
    <div className="alarms" role="alert">
      {alarms.map((a) => (
        <div key={a.id} className="alarm" data-status={a.status} data-acked={acked[a.id] || undefined}>
          <Mark s={a.status} size={12} />
          <span className="alarm-text">{a.text}</span>
          <span className="alarm-since">{a.since}</span>
          <button type="button" className="ghost alarm-ack" disabled={acked[a.id]} onClick={() => onAck(a.id)}>
            {acked[a.id] ? 'Acknowledged' : 'Acknowledge'}
          </button>
        </div>
      ))}
    </div>
  );
}

export type { Wristband };
