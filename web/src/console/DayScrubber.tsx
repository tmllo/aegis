// A thin day scrubber: drag to replay the HUD as of any mission day; the marks show the worst
// crew status per day. Release on the last day to return to live.
import { useMemo, useRef } from 'react';
import { statusOn } from '../core/scoring';
import type { Status } from '../data/types';
import { RANK } from './model';
import { useHud } from './hud';
import { useConsole } from './useConsole';

const COL: Record<Status, string> = { green: 'rgb(var(--accent) / 0.35)', amber: 'rgb(var(--warn))', red: 'rgb(var(--crit))' };

export function DayScrubber() {
  const { data } = useConsole();
  const { asOf, setAsOf } = useHud();
  const ref = useRef<HTMLDivElement>(null);
  const base = data?.crew;
  const days = useMemo(() => {
    if (!base) return [];
    return base.crew[0].series
      .map((r) => r.date)
      .filter((d) => d <= base.mission.today)
      .map((date) => ({ date, worst: base.crew.map((m) => statusOn(m, base, date).status.overall).reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'green') }));
  }, [base]);
  if (!days.length) return null;
  const i = asOf ? Math.max(0, days.findIndex((d) => d.date === asOf)) : days.length - 1;
  const pick = (x: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.max(0, Math.min(days.length - 1, Math.round(((x - r.left) / r.width) * (days.length - 1))));
    setAsOf(k === days.length - 1 ? null : days[k].date);
  };
  return (
    <div className="scrub">
      <span className="label">{asOf ? `Replay day ${i + 1}` : `Day ${i + 1} · live`}</span>
      <div
        ref={ref}
        className="scrub-bar"
        role="slider"
        aria-label="Mission day"
        aria-valuemin={1}
        aria-valuemax={days.length}
        aria-valuenow={i + 1}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setAsOf(days[Math.max(0, i - 1)].date);
          if (e.key === 'ArrowRight') setAsOf(i + 1 >= days.length - 1 ? null : days[i + 1].date);
        }}
      >
        {days.map((d) => (
          <i key={d.date} style={{ background: COL[d.worst] }} />
        ))}
        <b style={{ left: `${(i / (days.length - 1)) * 100}%` }} />
      </div>
      {asOf && (
        <button type="button" className="btn" style={{ height: 56 }} onClick={() => setAsOf(null)}>
          Live
        </button>
      )}
    </div>
  );
}
