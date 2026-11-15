// Storm HUD over the Sun side of the Earth: recent flares, a polar plot of where they sat on
// the Sun, the selected crew member's dose, the model's test scores, storm probability over
// time, and the May 2024 replay. Numbers from storm_forecast.json and core/radiation.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doseSummary, sortedEvents } from '../core/radiation';
import type { FlareEvent, Status } from '../data/types';
import { StormChart } from './StormChart';
import { KV, Mark, Panel, statusWord } from './ui';
import { useConsole } from './useConsole';

const LEVEL: Record<FlareEvent['alert_level'], Status> = { none: 'green', watch: 'amber', warning: 'red' };

/** The solar disc as a polar plot: west to the right as seen from Earth. */
function SunPlot({ events, pick, onPick }: { events: FlareEvent[]; pick: string | null; onPick: (id: string) => void }) {
  const C = 160;
  const R = 130;
  const pt = (e: FlareEvent) => {
    const lon = ((e.longitude_deg ?? 0) * Math.PI) / 180;
    const lat = ((e.latitude_deg ?? 0) * Math.PI) / 180;
    return [C + R * Math.sin(lon) * Math.cos(lat), C - R * Math.sin(lat)];
  };
  return (
    <svg viewBox="0 0 320 320" style={{ width: '100%', height: '100%' }} aria-label="Flare positions">
      {[1, 0.66, 0.33].map((f) => (
        <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="rgb(var(--ink))" strokeOpacity={f === 1 ? 0.3 : 0.1} />
      ))}
      <line x1={C - R} x2={C + R} y1={C} y2={C} stroke="rgb(var(--ink))" strokeOpacity="0.08" />
      <line y1={C - R} y2={C + R} x1={C} x2={C} stroke="rgb(var(--ink))" strokeOpacity="0.08" />
      {[
        ['N', C, C - R - 8],
        ['S', C, C + R + 16],
        ['E', C - R - 12, C + 4],
        ['W', C + R + 12, C + 4],
      ].map(([l, x, y]) => (
        <text key={l as string} x={x as number} y={y as number} textAnchor="middle" className="chart-t">
          {l}
        </text>
      ))}
      {events
        .filter((e) => e.latitude_deg != null && e.longitude_deg != null && Math.abs(e.longitude_deg) <= 90)
        .map((e) => {
          const [x, y] = pt(e);
          const st = LEVEL[e.alert_level];
          const col = st === 'green' ? 'rgb(var(--accent))' : `rgb(var(--${st === 'red' ? 'crit' : 'warn'}))`;
          return (
            <g key={e.flare_id} onClick={() => onPick(e.flare_id)} style={{ cursor: 'pointer' }}>
              <circle cx={x} cy={y} r="14" fill="transparent" />
              <circle cx={x} cy={y} r={pick === e.flare_id ? 6 : 3.5} fill={col} />
              {pick === e.flare_id && (
                <text x={x + 10} y={y - 8} className="chart-a">
                  {e.flare_class} {e.source_location ?? ''}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}

export default function StormPage() {
  const { data, cd, cv, seat } = useConsole();
  const nav = useNavigate();
  const [pick, setPick] = useState<string | null>(null);
  const events = useMemo(() => (data ? sortedEvents(data.storm) : []), [data]);
  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const recent = events.slice(-60);
  const table = events.slice(-9).reverse();
  const latest = events.at(-1);
  const m = data.storm.meta.metrics_test;
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const sel = events.find((e) => e.flare_id === pick) ?? latest;

  return (
    <>
      <Panel label="Flares" icon="storm" aside={`${events.length} scored`} className="st-left">
        <table className="tbl">
          <thead>
            <tr>
              <th>Peak UTC</th>
              <th>Class</th>
              <th className="num">p</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {table.map((e) => (
              <tr key={e.flare_id} data-status={LEVEL[e.alert_level]} onClick={() => setPick(e.flare_id)} style={pick === e.flare_id ? { background: 'rgb(var(--accent) / 0.1)' } : undefined}>
                <td className="num" style={{ textAlign: 'left' }}>
                  {e.peak_time.slice(5, 16).replace('T', ' ')}
                </td>
                <td>{e.flare_class}</td>
                <td className="num">{Math.round(e.p_storm * 100)}%</td>
                <td className="sc">
                  <Mark s={LEVEL[e.alert_level]} size={10} />
                  {e.alert_level === 'none' ? 'Quiet' : e.alert_level}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel label="Sun" icon="globe" aside={sel ? `${sel.flare_class} · ${sel.source_location ?? 'no location'}` : ''} className="st-sun">
        <SunPlot events={recent} pick={pick ?? latest?.flare_id ?? null} onPick={setPick} />
      </Panel>

      <div className="st-right">
        <Panel label={`Dose · ${seat[cv.m.id]}`} icon="dial" aside={cd.environments[cd.mission.environment]?.label}>
          <dl className="stats">
            <div className="st">
              <dt>Today</dt>
              <dd>
                {dose.daily_mSv?.toFixed(2) ?? '--'}
                <small>mSv</small>
              </dd>
            </div>
            <div className="st">
              <dt>Mission</dt>
              <dd>
                {dose.cumulative_mSv?.toFixed(0) ?? '--'}
                <small>mSv</small>
              </dd>
            </div>
          </dl>
          <div className="meter" style={{ paddingLeft: 0 }}>
            <span className="meter-l">Career</span>
            <span className="meter-bar">
              <i style={{ width: `${Math.min(100, (dose.fraction ?? 0) * 100)}%` }} />
            </span>
            <span className="meter-v">
              {dose.fraction != null ? (dose.fraction * 100).toFixed(1) : '--'}
              <small>%</small>
            </span>
          </div>
          <dl className="kvs">
            <KV k="Career limit" v={`${dose.careerLimit_mSv} mSv`} />
            <KV k="Site rate" v={`${dose.environmentDaily_mSv} mSv/d`} />
            <KV k="Days to limit" v={dose.daysToLimit != null ? Math.round(dose.daysToLimit) : '--'} />
          </dl>
        </Panel>
        <Panel label="Model" icon="chart" aside={data.storm.meta.model}>
          <dl className="kvs">
            <KV k="Hit rate" v={`${Math.round(m.hit_rate * 100)} %`} />
            <KV k="False alarms" v={`${m.false_alarms_per_month.toFixed(1)} / month`} />
            <KV k="Median lead" v={`${m.median_lead_time_h.toFixed(1)} h`} />
            <KV k="Skill vs climatology" v={m.brier_skill_vs_climatology.toFixed(2)} />
            <KV k="Horizon" v={`${data.storm.meta.horizon_hours} h`} />
          </dl>
          <button type="button" className="btn btn-primary mt-auto" onClick={() => nav('/storm/replay')}>
            Replay May 2024
          </button>
        </Panel>
      </div>

      <div className="strip" style={{ gridTemplateColumns: '1fr', left: 396, right: 476 }}>
        <Panel label="Storm probability" icon="chart" aside={latest ? `Now ${statusWord(LEVEL[latest.alert_level])}` : ''}>
          <StormChart events={recent} meta={data.storm.meta} height={150} />
        </Panel>
      </div>
    </>
  );
}
