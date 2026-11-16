// Cabin tab: Tomas's habitat watch (habitat_telemetry.json, HABITAT_CONTRACT v2.2) drawn
// in the One Look frame. Amber/red come from meta.thresholds; every planted fault shows as caught, missed
// or false alarm; crew links say "Possible environmental cause", never a diagnosis.
import { useState, type ReactNode } from 'react';
import { Shape } from '../ds';
import { WORD } from '../model';
import { cue } from '../ui';
import { useStation } from '../state';
import '../cabin.css';
import { useHabitat } from '../../habitat';
import { HONEST_FOOTER, anomalyTag, fmtDate, latestValue, leadTimeText, scoreStatus } from '../../habitat/logic';
import type { ChannelKey, HabitatData } from '../../habitat/types';
import { Bar, Check, Page, SideCap } from '../frame';

const DAYS = 14;
const POINTS = 84;

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

const digits = (k: ChannelKey) => (k === 'rh_pct' ? 0 : k === 'ppco2_mmhg' ? 2 : 1);

/** The one big reading: value, status word, its limit and 14 days as a line against that limit. */
function Hero({ d, k }: { d: HabitatData; k: ChannelKey }) {
  const ch = d.channels[k];
  const s = d.status.by_channel[k];
  const val = latestValue(d, k);
  const h = history(d, k);
  const vals = h.map((p) => p.v).filter((x): x is number => x != null);
  const lim = ch.limits.max ?? ch.limits.min;
  let lo = Math.min(...vals, lim ?? Infinity);
  let hi = Math.max(...vals, lim ?? -Infinity);
  const pad = (hi - lo || 1) * 0.15;
  lo -= pad;
  hi += pad;
  const W = 640;
  const H = 120;
  const x = (i: number) => (i / Math.max(1, h.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const pts = h.map((p, i) => (p.v == null ? null : `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)).filter(Boolean).join(' ');
  const live = d.anomalies.find((a) => a.channel === k && a.status === 'active');
  const action = live ? live.action : s === 'green' ? null : ch.actions[s];
  return (
    <div className={`cb-hero is-${s}`} key={k}>
      <p className="cb-hero-l">{ch.label}</p>
      <p className="cb-hero-v">
        {val == null ? '–' : val.toFixed(digits(k))}
        <small>{ch.unit}</small>
      </p>
      <p className="cb-hero-s">
        <Shape s={s} size={12} />
        {WORD[s]}
        {lim != null && <span>Limit {lim} {ch.unit}</span>}
      </p>
      <svg className="cb-hero-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`${ch.label}, last ${DAYS} days`}>
        {lim != null && <line x1="0" x2={W} y1={y(lim)} y2={y(lim)} className="cb-lim" />}
        <polyline points={pts} className="cb-line" />
        {h.map((p, i) => (p.v != null && p.flag ? <circle key={i} cx={x(i)} cy={y(p.v)} r="3" className={`cb-dot is-${p.flag}`} /> : null))}
      </svg>
      <p className="cb-hero-n">{action ? `${action}${live?.linked_crew_flags.length ? ' Possible environmental cause for crew flags.' : ''}` : ch.health_link}</p>
    </div>
  );
}

export function useCabin(): CabinParts {
  const { data, error } = useHabitat();
  const [pick, setPick] = useState<ChannelKey | null>(null);
  const sound = useStation((st) => st.sound);
  if (error) return { sub: 'Cabin telemetry could not be loaded', left: null, object: <p className="ds-note">{error}</p>, right: null };
  if (!data) return { sub: HONEST_FOOTER, left: null, object: null, right: null };

  const keys = Object.keys(data.channels) as ChannelKey[];
  const events = [...data.anomalies].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const v = data.meta.validation?.model;
  const rank = { green: 0, amber: 1, red: 2 } as const;
  const hero = pick ?? [...keys].sort((a, b) => rank[data.status.by_channel[b]] - rank[data.status.by_channel[a]])[0];

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
      <div className="cb">
        <Hero d={data} k={hero} />
        <div className="cb-row" role="tablist" aria-label="Cabin readings">
          {keys.map((k) => {
            const val = latestValue(data, k);
            const st = data.status.by_channel[k];
            return (
              <button key={k} type="button" role="tab" aria-selected={k === hero} className={`cb-chip is-${st}${k === hero ? ' is-on' : ''}`} onClick={() => (cue('tick', sound), setPick(k))}>
                <span>
                  {st !== 'green' && <Shape s={st} size={10} />}
                  {data.channels[k].label.replace(' (partial pressure)', '')}
                </span>
                <b>
                  {val == null ? '–' : val.toFixed(digits(k))}
                  <small>{data.channels[k].unit}</small>
                </b>
              </button>
            );
          })}
        </div>
      </div>
    ),
    right: (
      <>
        {/* what the cabin air does to the body right now, against NASA-STD-3001 limits (Tomas's channel data) */}
        <SideCap>Effect on your body</SideCap>
        {keys.map((k) => {
          const c = data.channels[k];
          const val = latestValue(data, k);
          const st = data.status.by_channel[k];
          const lim = c.limits;
          const range = lim.min != null && lim.max != null ? `${lim.min}–${lim.max}` : lim.max != null ? `under ${lim.max}` : lim.min != null ? `over ${lim.min}` : null;
          const word = st === 'green' ? 'No effect expected' : st === 'red' ? 'Act now' : 'Watch';
          return (
            <div key={k} className={`cb-fx is-${st}`}>
              <p className="cb-fx-h">
                <b>{c.label.replace(' (partial pressure)', '')}</b>
                <span>
                  {val == null ? '–' : val.toFixed(digits(k))} {c.unit}
                  {range && <em> · limit {range}</em>}
                </span>
              </p>
              <p className="cb-fx-w">
                {st !== 'green' && <Shape s={st} size={9} />} {word}
              </p>
              {st !== 'green' && <p className="cb-fx-t">{c.health_link}</p>}
            </div>
          );
        })}
        <p className="cb-fx-src">Limits: NASA-STD-3001. The CO₂ limit (3 mmHg, 1-hour average) is set to keep crew headaches under 1.4% (NASA OCHMO-TB-004).</p>
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
