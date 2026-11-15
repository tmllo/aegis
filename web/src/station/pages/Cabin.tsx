// Cabin tab: Tomas's habitat watch (habitat_telemetry.json, HABITAT_CONTRACT v2.2) drawn
// in the One Look frame. Amber/red come from meta.thresholds; every planted fault shows as caught, missed
// or false alarm; crew links say "Possible environmental cause", never a diagnosis.
import type { ReactNode } from 'react';
import { useHabitat } from '../../habitat';
import { HONEST_FOOTER, anomalyTag, fmtDate, latestValue, leadTimeText, scoreStatus } from '../../habitat/logic';
import type { ChannelKey, HabitatData } from '../../habitat/types';
import { Bar, Check, Page, SideCap, Vital, VITAL_ICON } from '../frame';

const ICON: Record<ChannelKey, keyof typeof VITAL_ICON> = {
  ppco2_mmhg: 'pressure',
  ppo2_kpa: 'pressure',
  cabin_pressure_kpa: 'pressure',
  temp_c: 'temp',
  rh_pct: 'temp',
};
const DAYS = 14;
const POINTS = 28;

/** POINTS evenly spaced samples over the last DAYS days, flagged by the detector score. */
function history(d: HabitatData, k: ChannelKey) {
  const per = Math.round((24 * 60) / d.meta.sample_interval_min);
  const rows = d.series.slice(-DAYS * per);
  const step = Math.max(1, Math.floor(rows.length / POINTS));
  const out = [];
  for (let n = rows.length - 1; n >= 0 && out.length < POINTS; n -= step) {
    const r = rows[n];
    const f = scoreStatus(r.score[k], d.meta.thresholds);
    out.unshift({ v: r[k], flag: f === 'green' ? null : f });
  }
  return out;
}

export interface CabinParts {
  sub: string;
  left: ReactNode;
  object: ReactNode;
  right: ReactNode;
}

export function useCabin(): CabinParts {
  const { data, error } = useHabitat();
  if (error) return { sub: 'Cabin telemetry could not be loaded', left: null, object: <p className="ds-note">{error}</p>, right: null };
  if (!data) return { sub: HONEST_FOOTER, left: null, object: null, right: null };

  const keys = Object.keys(data.channels) as ChannelKey[];
  const events = [...data.anomalies].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const v = data.meta.validation?.model;

  return {
    sub: HONEST_FOOTER,
    left: (
      <>
        <Check s={data.status.overall} title="Status" word={data.status.overall === 'green' ? 'All in range' : `${keys.filter((k) => data.status.by_channel[k] !== 'green').length} to watch`} />
        {events.map((a) => (
          <Check key={a.id} s={a.status === 'active' ? a.severity : 'green'} title={data.channels[a.channel].label} word={`${anomalyTag(a).label} · ${fmtDate(a.start)}`} />
        ))}
      </>
    ),
    object: (
      <div className="fr-panel cb">
        {keys.map((k) => {
          const ch = data.channels[k];
          const val = latestValue(data, k);
          const s = data.status.by_channel[k];
          const live = events.find((a) => a.channel === k && a.status === 'active');
          return (
            <Vital
              key={k}
              icon={ICON[k]}
              label={ch.label}
              value={val == null ? '–' : val.toFixed(k === 'rh_pct' ? 0 : 1)}
              unit={ch.unit}
              s={s}
              history={history(data, k)}
              note={live ? `${live.action}${live.linked_crew_flags.length ? ' Possible environmental cause for crew flags.' : ''}` : s === 'green' ? undefined : ch.actions[s]}
            />
          );
        })}
      </div>
    ),
    right: (
      <>
        <SideCap>Detector, last {DAYS} days</SideCap>
        {events.map((a) => (
          <Bar key={a.id} label={data.channels[a.channel].label} value={anomalyTag(a).label} frac={a.detected ? 1 : 0.15} s={a.detected ? 'green' : 'amber'} note={leadTimeText(a) ?? undefined} />
        ))}
        {v && (
          <>
            <SideCap>Tested on NASA SMAP/MSL</SideCap>
            <Bar label="Faults found" value={`${Math.round((v.recall ?? 0) * 100)}%`} frac={v.recall ?? 0} />
            <Bar label="Alerts that were real" value={`${Math.round((v.precision ?? 0) * 100)}%`} frac={v.precision ?? 0} />
          </>
        )}
      </>
    ),
  };
}

/** The Cabin tab: the air the crew breathes, scored by Tomas's detector. */
export default function Cabin() {
  const c = useCabin();
  return <Page title="Cabin" sub={c.sub} left={c.left} object={c.object} right={c.right} />;
}
