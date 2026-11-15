// Timeline: every mission day on one axis (crew health, daily dose, storm events). Drag or tap
// a day and the whole HUD replays as of that day: body tints, gauges and cards on every screen.
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { statusOn } from '../core/scoring';
import type { Status } from '../data/types';
import { RANK, STATUS_WORD } from './model';
import { KV, Mark, Panel } from './ui';
import { useConsole } from './useConsole';
import { useHud } from './hud';

const COL: Record<Status, string> = { green: 'rgb(var(--accent) / 0.55)', amber: 'rgb(var(--warn))', red: 'rgb(var(--crit))' };

export default function TimelinePage() {
  const { data, views, seat, cv } = useConsole();
  const { asOf, setAsOf } = useHud();
  const nav = useNavigate();
  const strip = useRef<HTMLDivElement>(null);
  const base = data?.crew;

  const days = useMemo(() => {
    if (!base) return [];
    const dates = base.crew[0].series.map((r) => r.date).filter((d) => d <= base.mission.today);
    const events = data!.storm.events;
    return dates.map((date) => {
      const crew = base.crew.map((m) => statusOn(m, base, date).status.overall);
      const worst = crew.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'green');
      const dayEvents = events.filter((e) => e.peak_time.slice(0, 10) === date);
      const maxP = dayEvents.reduce((m, e) => Math.max(m, e.p_storm), 0);
      const alert = dayEvents.some((e) => e.alert_level === 'warning') ? 'red' : dayEvents.some((e) => e.alert_level === 'watch') ? 'amber' : null;
      return { date, crew, worst, maxP, alert: alert as Status | null, n: dayEvents.length };
    });
  }, [base, data]);

  if (!base || !cv || !days.length) return <p className="cx-error cx-wait">Loading</p>;

  const sel = asOf ?? base.mission.today;
  const i = Math.max(0, days.findIndex((d) => d.date === sel));
  const d = days[i];
  const dose = cv.m.series.find((r) => r.date === sel);
  const maxDose = Math.max(...cv.m.series.map((r) => r.dose_mSv_day ?? 0));
  const pick = (clientX: number) => {
    const r = strip.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.max(0, Math.min(days.length - 1, Math.round(((clientX - r.left) / r.width) * (days.length - 1))));
    setAsOf(k === days.length - 1 ? null : days[k].date);
  };

  return (
    <>
      <Panel label="Replay" icon="chart" aside={asOf ? 'Replaying' : 'Live'} className="tl-right">
        <div className="big">
          <b>Day {i + 1}</b>
        </div>
        <span className="label">{sel}</span>
        <dl className="kvs gap">
          {views.map((v, k) => (
            <KV key={v.m.id} k={seat[v.m.id]} v={<><Mark s={d.crew[k]} size={10} /> {STATUS_WORD[d.crew[k]]}</>} status={d.crew[k]} />
          ))}
          <KV k={`Dose · ${seat[cv.m.id]}`} v={dose?.dose_mSv_day != null ? `${dose.dose_mSv_day.toFixed(2)} mSv` : '--'} />
          <KV k="Flares" v={d.n ? `${d.n} · max p ${Math.round(d.maxP * 100)} %` : 'None'} status={d.alert} />
        </dl>
        <div className="row2 mt-auto">
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setAsOf(null)} disabled={!asOf}>
            Back to today
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => nav('/vitals')}>
            Open vitals
          </button>
        </div>
      </Panel>

      <div className="strip" style={{ gridTemplateColumns: '1fr', right: 476, height: 300 }}>
        <Panel label="Mission days" icon="chart" aside={`${days.length} days · drag to replay`}>
          <div
            ref={strip}
            className="tl"
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
            {views.map((v, k) => (
              <div key={v.m.id} className="tl-row">
                <span className="tl-l">{seat[v.m.id]}</span>
                <div className="tl-cells">
                  {days.map((x) => (
                    <i key={x.date} style={{ background: COL[x.crew[k]] }} />
                  ))}
                </div>
              </div>
            ))}
            <div className="tl-row">
              <span className="tl-l">Dose</span>
              <div className="tl-cells tl-bars">
                {days.map((x) => {
                  const v = cv.m.series.find((r) => r.date === x.date)?.dose_mSv_day ?? 0;
                  return <i key={x.date} style={{ height: `${Math.max(4, (v / (maxDose || 1)) * 100)}%` }} />;
                })}
              </div>
            </div>
            <div className="tl-row">
              <span className="tl-l">Storm</span>
              <div className="tl-cells tl-bars">
                {days.map((x) => (
                  <i key={x.date} style={{ height: `${Math.max(2, x.maxP * 250)}%`, background: x.alert ? COL[x.alert] : undefined }} />
                ))}
              </div>
            </div>
            <span className="tl-cursor" style={{ left: `calc(56px + (100% - 56px) * ${i / (days.length - 1)})` }} />
          </div>
          <div className="pager">
            <span>{days[0].date}</span>
            <span>{days[days.length - 1].date}</span>
          </div>
        </Panel>
      </div>
    </>
  );
}
