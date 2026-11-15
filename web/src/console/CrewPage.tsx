// Crew (home): the Earth stays free in the centre. Safe zones round it: cabin consumables on
// the left rail, the selected crew member's vitals on the right rail, active alerts and the one
// action in the bottom dock. Nominal readings stay quiet; a reading that crosses expands.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { sortedEvents } from '../core/radiation';
import type { CabinReading } from '../core/cabin';
import type { MetricKey } from '../data/types';
import { METRIC_TARGET, rowOf, SHORT, STATUS_WORD, type Row } from './model';
import { Confirm, Mark, Panel, statusWord } from './ui';
import { Widget, type WidgetData } from './Widget';
import { ViewControls } from './Controls';
import { useConsole } from './useConsole';

const CABIN_KEYS = ['cabin.pressure', 'cabin.ppo2', 'cabin.ppco2', 'cabin.water_clean'];
const VITALS: MetricKey[] = ['hr', 'bp_sys', 'sleep_h', 'temp', 'glucose', 'mood'];

export const cabinWidget = (r: CabinReading): WidgetData => ({
  id: r.metric.key,
  label: r.metric.short,
  value: r.value,
  digits: r.metric.digits,
  unit: r.metric.unit,
  status: r.status,
  lo: r.metric.bands.amber_low ?? r.metric.bands.red_low ?? null,
  hi: r.metric.bands.amber_high ?? r.metric.bands.red_high ?? null,
  meta: `${r.metric.source} limit`,
});

export const rowWidget = (r: Row, action?: WidgetData['action']): WidgetData => ({
  id: r.k,
  label: r.label,
  value: r.value,
  digits: r.digits,
  unit: r.unit,
  status: r.status,
  lo: r.lo,
  hi: r.hi,
  mean: r.mean,
  history: r.history,
  dates: r.dates,
  flagged: r.flagged,
  meta: r.mean != null ? `usual ${r.mean.toFixed(r.digits)}` : '',
  action,
});

export default function CrewPage() {
  const { data, cd, views, seat, cv, setCrew } = useConsole();
  const { cabin } = useCabin();
  const nav = useNavigate();
  const [ask, setAsk] = useState<MetricKey | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const flags = useMemo(
    () => (cd ? views.flatMap((v) => v.scores.filter((s) => s.status !== 'green').map((s) => ({ v, s, r: rowOf(cd, v.m, v.scores, s.metric) }))) : []),
    [cd, views],
  );
  if (!data || !cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const latest = sortedEvents(data.storm).at(-1);
  const rows = VITALS.map((k) => rowOf(cd, cv.m, cv.scores, k));
  const issue = cv.issue ? rowOf(cd, cv.m, cv.scores, cv.issue.metric) : null;
  const act = (r: Row) => ({ label: done[`${cv.m.id}-${r.k}`] ? 'Logged' : r.status === 'red' ? 'Call surgeon' : 'Re-measure', onClick: () => setAsk(r.k) });
  const open = (k: MetricKey) => nav(METRIC_TARGET[k] ? `/vitals?t=${METRIC_TARGET[k]}&k=${k}` : '/vitals');
  const asked = ask ? rowOf(cd, cv.m, cv.scores, ask) : null;

  return (
    <>
      {/* left rail: cabin consumables */}
      <div className="rail rail-left">
        <span className="label">Cabin</span>
        {CABIN_KEYS.map((k) => {
          const r = cabin?.readings.find((x) => x.metric.key === k);
          return r ? <Widget key={k} w={cabinWidget(r)} onClick={() => nav('/cabin')} /> : null;
        })}
        {latest && (
          <Widget
            mode="compact"
            w={{ id: 'storm', label: 'Storm', icon: 'storm', value: Math.round(latest.p_storm * 100), digits: 0, unit: '%', status: latest.alert_level === 'none' ? 'green' : latest.alert_level === 'watch' ? 'amber' : 'red', lo: null, hi: null }}
            onClick={() => nav('/storm')}
          />
        )}
      </div>

      {/* right rail: the selected crew member's vitals, alerts first */}
      <div className="rail rail-right">
        <span className="label">
          {seat[cv.m.id]} · {cv.m.role} · {STATUS_WORD[cv.overall]}
        </span>
        {rows
          .slice()
          .sort((a, b) => (b.status !== 'green' ? 1 : 0) - (a.status !== 'green' ? 1 : 0))
          .map((r) => (
            <Widget key={r.k} w={rowWidget(r, r.status !== 'green' ? act(r) : undefined)} onClick={() => open(r.k)} />
          ))}
      </div>

      <ViewControls style={{ left: 'calc(50% + 250px)', bottom: 200 }} />

      {/* bottom dock: active alerts and the one action */}
      <div className="dock">
        <Panel label="Active alerts" icon="alert" aside={`${flags.length} open`} className="dock-alerts">
          <div className="chips">
            {flags.map((f) => (
              <button key={`${f.v.m.id}-${f.s.metric}`} type="button" className="chip" data-status={f.s.status} aria-pressed={f.v.m.id === cv.m.id} onClick={() => setCrew(f.v.m.id)}>
                <Mark s={f.s.status} size={10} />
                <span>{seat[f.v.m.id]}</span>
                <b>{SHORT[f.s.metric]}</b>
                <span className="mono">
                  {f.r.value?.toFixed(f.r.digits)} {f.r.unit}
                </span>
              </button>
            ))}
            {!flags.length && <span className="note">All crew nominal</span>}
          </div>
        </Panel>
        <button type="button" className="btn btn-primary dock-act" disabled={!issue} onClick={() => issue && setAsk(issue.k)}>
          {issue ? `${issue.status === 'red' ? 'Call surgeon' : 'Re-measure'} · ${seat[cv.m.id]} ${SHORT[issue.k]}` : 'No action due'}
        </button>
      </div>

      {asked && (
        <Confirm
          open
          code={`2.${String(VITALS.indexOf(asked.k) + 1).padStart(3, '0')}`}
          title={`${asked.status === 'red' ? 'Call surgeon' : 'Re-measure'} ${SHORT[asked.k].toLowerCase()}`}
          tag="Vitals"
          status={`${seat[cv.m.id]} ${statusWord(asked.status)}`}
          body={asked.action}
          danger={asked.status === 'red'}
          onDone={() => {
            setDone((d) => ({ ...d, [`${cv.m.id}-${asked.k}`]: true }));
            setAsk(null);
          }}
          onCancel={() => setAsk(null)}
        />
      )}
    </>
  );
}
