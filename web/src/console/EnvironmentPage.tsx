// ENVIRONMENT: cabin air and radiation around the globe. Modes in the same section: Live,
// Shelter drill (a real warning replayed as an alarm) and the May 2024 replay.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { doseSummary, sortedEvents } from '../core/radiation';
import type { Status } from '../data/types';
import { Widget } from './Widget';
import { cabinWidget } from './cabinWidget';
import { StormChart } from './StormChart';
import { KV, Mark, Panel } from './ui';
import { ViewControls } from './Controls';
import ShelterPage from './ShelterPage';
import ReplayPage from './ReplayPage';
import { useConsole } from './useConsole';

const AIR = ['cabin.ppco2', 'cabin.ppo2', 'cabin.pressure'];
const LEVEL: Record<string, Status> = { none: 'green', watch: 'amber', warning: 'red' };

export default function EnvironmentPage() {
  const { data, cd, cv, seat } = useConsole();
  const { cabin } = useCabin();
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') ?? 'live';
  const events = useMemo(() => (data ? sortedEvents(data.storm).slice(-48) : []), [data]);
  const setMode = (m: string) => setParams(m === 'live' ? {} : { mode: m }, { replace: true });

  const modes = (
    <nav className="env-modes" aria-label="Mode">
      {[
        ['live', 'Live'],
        ['shelter', 'Shelter drill'],
        ['replay', 'Replay May 2024'],
      ].map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {l}
        </button>
      ))}
    </nav>
  );
  if (mode === 'shelter') return (<>{modes}<ShelterPage /></>);
  if (mode === 'replay') return (<>{modes}<ReplayPage /></>);
  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const latest = events.at(-1);
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const tanks = cabin?.readings.filter((r) => r.metric.tank) ?? [];
  const off = cabin?.readings.filter((r) => r.value == null) ?? [];

  return (
    <>
      {modes}
      <div className="rail rail-left">
        <span className="label">Cabin air · {cabin?.readings.some((r) => r.quality === 'live') ? 'live' : 'recorded 14 Nov'}</span>
        {AIR.map((k) => {
          const r = cabin?.readings.find((x) => x.metric.key === k);
          return r ? <Widget key={k} w={cabinWidget(r)} /> : null;
        })}
        {tanks.map((r) => (
          <Widget key={r.metric.key} mode="compact" w={cabinWidget(r)} />
        ))}
        {off.map((r) => (
          <Widget key={r.metric.key} mode="compact" w={cabinWidget(r)} />
        ))}
      </div>

      <div className="rail rail-right">
        <span className="label">Radiation</span>
        <Widget mode="standard" w={{ id: 'dose', label: `Dose today · ${seat[cv.m.id]}`, value: dose.daily_mSv, digits: 2, unit: 'mSv', status: null, lo: null, hi: null, meta: `site ${dose.environmentDaily_mSv} mSv/d` }} />
        <Widget mode="standard" w={{ id: 'career', label: 'Career used', value: dose.fraction != null ? dose.fraction * 100 : null, digits: 1, unit: '%', status: null, lo: null, hi: null, meta: `limit ${dose.careerLimit_mSv} mSv` }} />
        {latest && (
          <Panel label="Storm forecast" icon="storm" aside={`${data.storm.meta.horizon_hours} h horizon`} className="env-storm">
            <div className="state" data-status={LEVEL[latest.alert_level]} style={{ marginTop: 0 }}>
              <Mark s={LEVEL[latest.alert_level]} />
              <b>{latest.alert_level === 'none' ? 'Quiet' : latest.alert_level}</b>
              <span>
                {latest.flare_class} · p {Math.round(latest.p_storm * 100)} %
              </span>
            </div>
            <div style={{ height: 150, display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <StormChart events={events} meta={data.storm.meta} height={130} />
            </div>
            <dl className="kvs">
              <KV k="Hit rate (test)" v={`${Math.round(data.storm.meta.metrics_test.hit_rate * 100)} %`} />
              <KV k="Median lead" v={`${data.storm.meta.metrics_test.median_lead_time_h.toFixed(1)} h`} />
            </dl>
          </Panel>
        )}
      </div>
      <ViewControls style={{ left: 'calc(50% - 160px)', bottom: 48 }} />
    </>
  );
}
