// One reading, three states, chosen by status (management by exception):
//   compact  icon + value, for nominal readings at the edges
//   standard label, value, unit and a 10-point micro-sparkline
//   alert    big trend with the threshold band, status word and the one action
// Ice-white / desaturated cyan for passive data; amber and coral-red only when a reading crosses.
import type { Status } from '../data/types';
import { Band, Chart, Icon, Mark, Num, type GaugeValue } from './ui';
import { STATUS_WORD } from './model';

export interface WidgetData extends GaugeValue {
  id: string;
  label: string;
  icon?: string;
  history?: (number | null)[];
  dates?: string[];
  flagged?: boolean[];
  /** Small caps line under the label (source, age, usual). */
  meta?: string;
  action?: { label: string; onClick: () => void };
}

function Spark({ values, status }: { values: (number | null)[]; status: Status | null }) {
  const v = values.slice(-10).filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${22 - ((x - lo) / (hi - lo || 1)) * 20}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" className="spark" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={status && status !== 'green' ? `rgb(var(--${status === 'red' ? 'crit' : 'warn'}))` : 'rgb(var(--accent) / 0.8)'} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Widget({ w, mode, onClick }: { w: WidgetData; mode?: 'compact' | 'standard' | 'alert'; onClick?: () => void }) {
  const state = mode ?? (w.status === 'amber' || w.status === 'red' ? 'alert' : 'standard');
  if (state === 'compact') {
    return (
      <button type="button" className="wg wg-compact" data-status={w.status ?? undefined} onClick={onClick}>
        {w.icon ? <Icon name={w.icon} size={14} /> : <Mark s={w.status} size={10} />}
        <span className="wg-l">{w.label}</span>
        <b>
          <Num v={w.value} d={w.digits} />
        </b>
        <small>{w.value != null ? w.unit : 'Not connected'}</small>
      </button>
    );
  }
  if (state === 'standard') {
    return (
      <button type="button" className="wg wg-std" data-status={w.status ?? undefined} onClick={onClick}>
        <span className="wg-head">
          <span className="wg-l">{w.label}</span>
          <Mark s={w.status} size={9} />
        </span>
        <span className="wg-row">
          <b>
            <Num v={w.value} d={w.digits} />
          </b>
          <small>{w.value != null ? w.unit : 'Not connected'}</small>
          {w.history && w.history.length > 1 ? <Spark values={w.history} status={w.status} /> : <span className="wg-meta">{w.meta}</span>}
        </span>
      </button>
    );
  }
  return (
    <div className="wg wg-alert" data-status={w.status ?? undefined}>
      <span className="wg-head">
        <span className="wg-l">
          <Mark s={w.status} size={11} /> {w.label}
        </span>
        <b className="wg-word">{w.status ? STATUS_WORD[w.status] : ''}</b>
      </span>
      <span className="wg-row" onClick={onClick} role={onClick ? 'button' : undefined}>
        <b className="wg-big">
          <Num v={w.value} d={w.digits} />
        </b>
        <small>{w.unit}</small>
        <span className="wg-meta">{w.meta}</span>
      </span>
      {w.history && w.history.length > 2 && w.dates ? (
        <div className="wg-chart">
          <Chart values={w.history} dates={w.dates} flagged={w.flagged} g={w} height={150} />
        </div>
      ) : (
        <Band g={w} />
      )}
      {w.action && (
        <button type="button" className="btn btn-alert" onClick={w.action.onClick}>
          {w.action.label}
        </button>
      )}
    </div>
  );
}
