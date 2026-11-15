// CREW (home): the body HUD for the selected crew member, by exception. Shown in full: overall
// status, the top flag, dose today, and one more reading only if it is flagged. Everything else
// is a compact chip until it is flagged. Inline actions: Check-in, Re-measure, Handoff. Tap an
// organ (or a chip) to dive in; Deeper shows the analytics. A thin day scrubber replays any day.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMind } from '../data/mind';
import { postMeasure, type MeasureReply } from '../data/live';
import { useSearchParams } from 'react-router-dom';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import { doseSummary } from '../core/radiation';
import type { MetricKey, Status } from '../data/types';
import { fmt, METRIC_TARGET, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS } from './model';
import { Band, Chart, Confirm, Icon, KV, Mark, Panel } from './ui';
import { Widget, type WidgetData } from './Widget';
import { ViewControls } from './Controls';
import { CheckinPanel } from './CheckinPanel';
import { HandoffPanel } from './HandoffPanel';
import { DayScrubber } from './DayScrubber';
import { useConsole } from './useConsole';
import { useHud } from './hud';
import { TINT_NODE } from './Porcelain';

const ALL: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];
const zText = (z: number | null) => (z == null ? '--' : `${z >= 0 ? '+' : '-'}${Math.abs(z).toFixed(1)}`);

export default function CrewPage() {
  const { cd, cv, seat } = useConsole();
  const [params, setParams] = useSearchParams();
  const { setFocus, setTint, setBodyTips, bodyReady, hover } = useHud();
  const [ask, setAsk] = useState<MetricKey | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [measured, setMeasured] = useState<{ k: string; reply: MeasureReply | null } | null>(null);
  const mind = useMind();
  const subject = cv?.m.id;
  const today = cd?.mission.today;
  useEffect(() => {
    if (subject && today) void mind.pull(subject, today);
  }, [subject, today, mind.pull]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawT = params.get('t');
  const target = rawT && rawT in TARGETS ? (rawT as TargetId) : null;
  const deep = !!target && params.get('deep') === '1';
  const panel = params.get('p'); // checkin | handoff
  const focusK = params.get('k') as MetricKey | null;
  const set = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const all = useMemo(() => (cd && cv ? ALL.map((k) => rowOf(cd, cv.m, cv.scores, k)) : []), [cd, cv]);

  // scene: focus, organ tints, one pinned tooltip on the affected organ
  useEffect(() => setFocus(target), [target, setFocus]);
  useEffect(() => () => setFocus(null), [setFocus]);
  useEffect(() => {
    const tint: Partial<Record<TargetId, Status>> = {};
    for (const [t, ks] of Object.entries(TARGET_METRICS) as [TargetId, MetricKey[]][]) {
      tint[t] = ks.map((k) => all.find((r) => r.k === k)?.status ?? 'green').reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), 'green');
    }
    setTint(tint);
    const worst = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status])[0];
    const t = target ?? (worst ? METRIC_TARGET[worst.k] : null);
    const r = target ? all.find((x) => x.k === (focusK ?? TARGET_METRICS[target][0])) : worst;
    setBodyTips(t && r && !deep ? [{ id: t, pos: TARGETS[t].spot as [number, number, number], title: `${TARGETS[t].label} · ${r.label}`, line: <em>{`${fmt(r.value, r.digits)} ${r.unit} · ${STATUS_WORD[r.status]}`}</em>, status: r.status }] : []);
  }, [all, target, focusK, deep, setTint, setBodyTips]);
  useEffect(() => () => setBodyTips([]), [setBodyTips]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const flagged = all.filter((r) => r.status !== 'green').sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0));
  const top = flagged[0] ?? null;
  const second = flagged[1] ?? null;
  const dose = doseSummary(cv.m, cd, cd.mission.environment);
  const shown = new Set([top?.k, second?.k, 'dose_mSv_day'].filter(Boolean));
  const chips = all.filter((r) => !shown.has(r.k));
  const actLabel = (s: Status) => (s === 'red' ? 'Call surgeon' : 'Re-measure');
  const widget = (r: typeof all[number]): WidgetData => ({ id: r.k, label: r.label, value: r.value, digits: r.digits, unit: r.unit, status: r.status, lo: r.lo, hi: r.hi, mean: r.mean, history: r.history, meta: r.mean != null ? `usual ${fmt(r.mean, r.digits)}` : '' });
  const open = (k: MetricKey) => METRIC_TARGET[k] && set({ t: METRIC_TARGET[k]!, k, deep: null, p: null });
  const rows = target ? TARGET_METRICS[target].map((k) => rowOf(cd, cv.m, cv.scores, k)) : [];
  const lead = rows.find((r) => r.k === focusK) ?? rows.slice().sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))[0];
  const asked = ask ? rowOf(cd, cv.m, cv.scores, ask) : null;
  const sys = (mind.server[`${cv.m.id}|${cd.mission.today}`]?.tasks ?? []).filter((x) => x.origin === 'system');
  const alertLine = sys.find((x) => !x.done && x.attrs?.message);
  // Simulated Bio-Monitor: a reading is today's simulated value for that metric
  const MEASURES: { k: MetricKey; label: string; metric: string }[] = [
    { k: 'bp_sys', label: 'BP', metric: 'vital.bp_sys' },
    { k: 'hr', label: 'HR', metric: 'vital.hr' },
    { k: 'temp', label: 'Temp', metric: 'vital.temp' },
  ];
  const measure = async (m: (typeof MEASURES)[number]) => {
    const r = all.find((x) => x.k === m.k);
    if (!r || r.value == null) return;
    const t = `${cd.mission.today}T${new Date().toISOString().slice(11, 19)}Z`;
    const reply = await postMeasure(cv.m.id, m.metric, t, r.value);
    setMeasured({ k: m.label, reply });
    void mind.pull(cv.m.id, cd.mission.today);
  };
  const hoverT = hover ? (Object.entries(TINT_NODE).find(([, n]) => n === hover.node)?.[0] as TargetId | undefined) : undefined;
  const hoverRow = hoverT ? all.find((r) => r.k === TARGET_METRICS[hoverT][0]) : undefined;

  return (
    <>
      {/* by exception: status, the top flag, dose, one more only if flagged */}
      <div className="rail rail-left">
        <div className="wg wg-std" data-status={cv.overall}>
          <span className="wg-head">
            <span className="wg-l">{seat[cv.m.id]} · {cv.m.role}</span>
            <Mark s={cv.overall} size={10} />
          </span>
          <span className="wg-row">
            <b style={{ fontSize: 30, color: cv.overall !== 'green' ? `rgb(var(--${cv.overall === 'red' ? 'crit' : 'warn'}))` : undefined }}>{STATUS_WORD[cv.overall]}</b>
            <span className="wg-meta">{flagged.length} flagged</span>
          </span>
        </div>
        {alertLine && (
          <div className="wg wg-compact" data-status={alertLine.attrs?.severity}>
            <Mark s={alertLine.attrs?.severity ?? 'amber'} size={10} />
            <span className="wg-l" style={{ whiteSpace: 'normal', letterSpacing: '0.04em', textTransform: 'none', fontSize: 12 }}>
              {alertLine.attrs?.message}
            </span>
          </div>
        )}
        {top && <Widget w={{ ...widget(top), action: { label: done[top.k] ? 'Logged' : actLabel(top.status), onClick: () => setAsk(top.k) } }} onClick={() => open(top.k)} />}
        <Widget mode="standard" w={{ id: 'dose', label: 'Dose today', value: dose.daily_mSv, digits: 2, unit: 'mSv', status: all.find((r) => r.k === 'dose_mSv_day')?.status ?? null, lo: null, hi: null, meta: dose.fraction != null ? `${(dose.fraction * 100).toFixed(1)} % of career` : '' }} />
        {second && <Widget w={{ ...widget(second), action: { label: done[second.k] ? 'Logged' : actLabel(second.status), onClick: () => setAsk(second.k) } }} onClick={() => open(second.k)} />}
      </div>

      {/* inline actions */}
      <div className="crew-acts">
        <button type="button" className="sq crew-act" aria-pressed={panel === 'checkin'} onClick={() => set({ p: panel === 'checkin' ? null : 'checkin', t: null, deep: null })}>
          <Icon name="mind" size={18} />
          <span>Check-in</span>
        </button>
        <button type="button" className="sq crew-act" disabled={!top} onClick={() => top && setAsk(top.k)}>
          <Icon name="measure" size={18} />
          <span>Re-measure</span>
        </button>
        <button type="button" className="sq crew-act" aria-pressed={panel === 'handoff'} onClick={() => set({ p: panel === 'handoff' ? null : 'handoff', t: null, deep: null })}>
          <Icon name="ground" size={18} />
          <span>Handoff</span>
        </button>
      </div>

      {/* right: check-in, handoff, or the organ */}
      {panel === 'checkin' && !target && <CheckinPanel className="crew-right" />}
      {panel === 'handoff' && !target && <HandoffPanel className="crew-right" />}
      {target && lead && (
        <Panel label={deep ? `${SHORT[lead.k]} · analysis` : TARGETS[target].label} icon={deep ? 'chart' : 'vitals'} aside={deep ? '3 weeks' : `Level 2`} className="crew-right">
          <button type="button" className="cx-back" onClick={() => (deep ? set({ deep: null }) : set({ t: null, k: null }))}>
            <Icon name="back" size={16} />
            Back
          </button>
          {!deep ? (
            <>
              {rows.map((r) => (
                <div key={r.k} className="vt-read">
                  <div className="state" data-status={r.status}>
                    <Mark s={r.status} />
                    <span>{r.label}</span>
                    <b style={{ marginLeft: 'auto' }}>{STATUS_WORD[r.status]}</b>
                  </div>
                  <div className="big" style={{ marginTop: 8 }}>
                    <b>{fmt(r.value, r.digits)}</b>
                    <small>{r.unit}</small>
                  </div>
                  <Band g={r} />
                  <dl className="kvs">
                    <KV k="Usual" v={r.mean != null ? `${fmt(r.mean, r.digits)} ${r.unit}` : 'No baseline'} />
                  </dl>
                </div>
              ))}
              <button type="button" className="btn btn-primary mt-auto" onClick={() => set({ deep: '1' })}>
                Deeper
              </button>
            </>
          ) : (
            <>
              <div style={{ height: 260, display: 'flex', flexDirection: 'column' }}>
                <Chart values={lead.history} dates={lead.dates} flagged={lead.flagged} g={lead} height={240} />
              </div>
              <dl className="stats gap">
                <div className="st" data-status={lead.status}>
                  <dt>z-score</dt>
                  <dd>{zText(lead.z)}</dd>
                </div>
                <div className="st">
                  <dt>Days running</dt>
                  <dd>{lead.running}</dd>
                </div>
              </dl>
              <dl className="kvs gap">
                {rows.filter((r) => r.k !== lead.k).map((r) => (
                  <KV key={r.k} k={r.label} v={`${fmt(r.value, r.digits)} ${r.unit} · z ${zText(r.z)}`} status={r.status} />
                ))}
                <KV k="Usual" v={`${fmt(lead.mean, lead.digits)} ${lead.unit}`} />
              </dl>
              <button type="button" className="btn btn-primary mt-auto" onClick={() => setAsk(lead.k)}>
                {done[lead.k] ? 'Logged' : lead.status === 'green' ? 'Log check' : actLabel(lead.status)}
              </button>
            </>
          )}
        </Panel>
      )}

      {/* Measure: the simulated Bio-Monitor, scored by the server (detect -> notify -> verify) */}
      <div className="crew-measure">
        <span className="label">Measure · Simulated Bio-Monitor</span>
        <div className="row2">
          {MEASURES.map((m) => (
            <button key={m.k} type="button" className="chip" onClick={() => void measure(m)}>
              {m.label}
            </button>
          ))}
          <button type="button" className="chip" disabled title="Not connected">
            SpO2
          </button>
        </div>
        {measured && (
          <p className="note" data-status={measured.reply?.assessment?.severity}>
            {measured.k}:{' '}
            {measured.reply == null
              ? 'server offline, kept on this device'
              : measured.reply.assessment
                ? `${STATUS_WORD[measured.reply.assessment.severity]} · ${measured.reply.assessment.action}`
                : 'within the usual range'}
            {measured.reply?.closed_tasks.length ? ' · task closed' : ''}
          </p>
        )}
      </div>

      {/* everything else: compact chips until flagged; open alert tasks first */}
      <div className="crew-chips">
        {sys.map((x) => (
          <span key={x.id} className="chip" data-status={x.done ? undefined : x.attrs?.severity}>
            <Mark s={x.done ? 'green' : x.attrs?.severity ?? 'amber'} size={9} />
            <span>{x.label}</span>
            <b className="mono">{x.done ? 'Done' : 'Open'}</b>
          </span>
        ))}
        {chips.map((r) => (
          <button key={r.k} type="button" className="chip" data-status={r.status} onClick={() => open(r.k)}>
            <Mark s={r.status} size={9} />
            <span>{SHORT[r.k]}</span>
            <b className="mono">
              {fmt(r.value, r.digits)} <small>{r.unit}</small>
            </b>
          </button>
        ))}
      </div>

      {!deep && <ViewControls layers style={{ right: 28, bottom: 116 }} />}
      {!bodyReady && <p className="cx-wait" style={{ position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%' }}>Loading body</p>}
      {hover && hoverRow && (
        <div className="hover-read" style={{ left: hover.x + 16, top: hover.y + 16 }}>
          {hoverT ? TARGETS[hoverT].label : hover.node}
          <b>
            {fmt(hoverRow.value, hoverRow.digits)} {hoverRow.unit}
          </b>
        </div>
      )}

      <div className="crew-scrub">
        <DayScrubber />
      </div>

      {asked && (
        <Confirm
          open
          code={`2.${String(ALL.indexOf(asked.k) + 1).padStart(3, '0')}`}
          title={`${asked.status === 'green' ? 'Log check' : actLabel(asked.status)} ${SHORT[asked.k].toLowerCase()}`}
          tag="Crew"
          status={`${seat[cv.m.id]} ${STATUS_WORD[asked.status]}`}
          body={asked.action}
          danger={asked.status === 'red'}
          onDone={() => {
            setDone((d) => ({ ...d, [asked.k]: true }));
            setAsk(null);
          }}
          onCancel={() => setAsk(null)}
        />
      )}
    </>
  );
}
