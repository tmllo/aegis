// ENVIRONMENT: the globe is the hero. Left: cabin air in three numbers. Right: the storm word
// and the dose as one bar. One button: Replay May 2024.
import { useSearchParams } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { cabinOverall } from '../core/cabin';
import { doseSummary, sortedEvents } from '../core/radiation';
import type { Status } from '../data/types';
import { STATUS_WORD } from './model';
import { Icon, Mark } from './ui';
import ReplayPage from './ReplayPage';
import { useConsole } from './useConsole';

const AIR = [
  { key: 'cabin.ppco2', label: 'CO2' },
  { key: 'cabin.ppo2', label: 'O2' },
  { key: 'cabin.pressure', label: 'Pressure' },
];
const LEVEL: Record<string, Status> = { none: 'green', watch: 'amber', warning: 'red' };

export default function EnvironmentPage() {
  const { data, cd, cv, seat } = useConsole();
  const { cabin } = useCabin();
  const [params, setParams] = useSearchParams();
  if (params.get('mode') === 'replay' || params.get('mode') === 'shelter')
    return (
      <>
        <button type="button" className="sq env-back" onClick={() => setParams({}, { replace: true })}>
          <Icon name="back" size={16} />
          <span>Globe</span>
        </button>
        <ReplayPage />
      </>
    );
  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const air = cabin ? cabinOverall(cabin.readings) : null;
  const latest = sortedEvents(data.storm).at(-1);
  const storm = latest ? LEVEL[latest.alert_level] : null;
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const pct = dose.fraction != null ? dose.fraction * 100 : null;

  return (
    <>
      <div className="one-card env-left" data-status={air ?? undefined}>
        <span className="one-seat">
          Cabin · <b>{air ? STATUS_WORD[air] : 'No feed'}</b>
        </span>
        <div className="three">
          {AIR.map((a) => {
            const r = cabin?.readings.find((x) => x.metric.key === a.key);
            return (
              <div key={a.key} data-status={r?.status ?? undefined}>
                <small>{a.label}</small>
                <b>{r?.value != null ? r.value.toFixed(r.metric.digits) : '--'}</b>
                <small>{r?.metric.unit}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="one-card env-right" data-status={storm ?? undefined}>
        <span className="one-seat">
          Storm · <b>{latest ? (latest.alert_level === 'none' ? 'Quiet' : latest.alert_level === 'watch' ? 'Watch' : 'Warning') : 'No feed'}</b>
        </span>
        <span className="one-line">
          {storm && storm !== 'green' && <Mark s={storm} size={11} />}
          {pct != null ? `${pct.toFixed(1)} % of career dose · ${seat[cv.m.id]}` : 'Dose not measured'}
        </span>
        <span className="meter-bar" style={{ display: 'block', marginTop: 4 }}>
          <i style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
        </span>
        <button type="button" className="btn" onClick={() => setParams({ mode: 'replay' }, { replace: true })}>
          Replay May 2024
        </button>
      </div>
    </>
  );
}
