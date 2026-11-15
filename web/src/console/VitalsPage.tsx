// Vitals HUD over the body in its studio (the persistent scene flies down to it).
//   1 whole body: soft steady tint on the affected organ, cyan arc gauges round the body,
//     signal bars for every metric on the right
//   2 an organ: the camera dives in, the outer layers fade, readings vs her own baseline
//   3 Deeper: clinical analytics (large trend with band and flags, z-score dial, days running,
//     related metrics, one action). No illustration.
// One Back per level. Numbers from src/data and src/core.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TARGETS, type TargetId } from '../components/body3d/targets';
import type { MetricKey, Status } from '../data/types';
import { fmt, GAUGES, METRIC_TARGET, RANK, rowOf, SHORT, STATUS_WORD, TARGET_METRICS, type Row } from './model';
import { Arc, Band, Chart, Confirm, Icon, KV, Mark, Num, Panel } from './ui';
import { ViewControls } from './Controls';
import { TINT_NODE } from './Porcelain';
import { useConsole } from './useConsole';
import { useHud } from './hud';

const ALL: MetricKey[] = ['hr', 'bp_sys', 'bp_dia', 'glucose', 'temp', 'sleep_h', 'mood', 'exercise_min', 'bone_loss_pct', 'dose_mSv_day'];
const FADE = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };
const zText = (z: number | null) => (z == null ? '--' : `${z >= 0 ? '+' : '-'}${Math.abs(z).toFixed(1)}`);

/** Signal bar: value against her band, the band as the middle half of the scale. */
function Meter({ r, onClick }: { r: Row; onClick: () => void }) {
  let fill = 0.5;
  let mean: number | null = null;
  if (r.value != null && r.lo != null && r.hi != null) {
    const span = r.hi - r.lo || 1;
    const min = r.lo - span / 2;
    fill = Math.max(0.02, Math.min(1, (r.value - min) / (span * 2)));
    mean = r.mean != null ? (r.mean - min) / (span * 2) : null;
  }
  return (
    <button type="button" className="meter" data-status={r.status} onClick={onClick}>
      <span className="meter-l">{r.label}</span>
      <span className="meter-bar">
        <i style={{ width: `${fill * 100}%` }} />
        {mean != null && <b style={{ left: `${mean * 100}%` }} />}
      </span>
      <span className="meter-v">
        <Num v={r.value} d={r.digits} />
        <small>{r.value != null ? r.unit : ''}</small>
      </span>
    </button>
  );
}

export default function VitalsPage() {
  const { cd, cv, seat } = useConsole();
  const [params, setParams] = useSearchParams();
  const { setFocus, setTint, setBodyTips, bodyReady, hover } = useHud();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const rawT = params.get('t');
  const target = rawT && rawT in TARGETS ? (rawT as TargetId) : null;
  const deep = !!target && params.get('deep') === '1';
  const level = deep ? 3 : target ? 2 : 1;
  const focusK = params.get('k') as MetricKey | null;

  const set = useCallback(
    (next: { t?: TargetId | null; deep?: boolean; k?: MetricKey | null }) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.t !== undefined) (next.t ? p.set('t', next.t) : p.delete('t'));
          if (next.deep !== undefined) (next.deep ? p.set('deep', '1') : p.delete('deep'));
          if (next.k !== undefined) (next.k ? p.set('k', next.k) : p.delete('k'));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const all = useMemo(() => (cd && cv ? ALL.map((k) => rowOf(cd, cv.m, cv.scores, k)) : []), [cd, cv]);

  // scene: camera focus, organ tints and the pinned tooltip
  useEffect(() => {
    setFocus(target);
  }, [target, setFocus]);
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
    setBodyTips(
      t && r && level < 3
        ? [{ id: t, pos: TARGETS[t].spot as [number, number, number], title: `${TARGETS[t].label} · ${r.label}`, line: <em>{`${fmt(r.value, r.digits)} ${r.unit} · ${STATUS_WORD[r.status]}`}</em>, status: r.status }]
        : [],
    );
  }, [all, target, focusK, level, setTint, setBodyTips]);
  useEffect(() => () => setBodyTips([]), [setBodyTips]);

  if (!cd || !cv) return <p className="cx-error cx-wait">Loading</p>;

  const T = target ? TARGETS[target] : null;
  const rows = target ? TARGET_METRICS[target].map((k) => rowOf(cd, cv.m, cv.scores, k)) : [];
  const lead = rows.find((r) => r.k === focusK) ?? rows.slice().sort((a, b) => RANK[b.status] - RANK[a.status] || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))[0];
  const hoverT = hover ? (Object.entries(TINT_NODE).find(([, n]) => n === hover.node)?.[0] as TargetId | undefined) : undefined;
  const hoverRow = hoverT ? all.find((r) => r.k === TARGET_METRICS[hoverT][0]) : undefined;
  const hoverLabel = hoverT ? TARGETS[hoverT].label : hover?.node.replace(/_/g, ' ');
  const gauges = GAUGES.map((g) => ({ ...g, r: rowOf(cd, cv.m, cv.scores, g.k) }));
  const actKey = lead ? `${cv.m.id}-${lead.k}` : '';
  const actLabel = lead ? (lead.status === 'red' ? 'Call surgeon' : lead.status === 'amber' ? 'Re-measure' : 'Log check') : '';
  const open = (k: MetricKey) => {
    const t = METRIC_TARGET[k];
    if (t) set({ t, k, deep: false });
  };

  return (
    <>
      <Panel label="Vitals" icon="vitals" aside={seat[cv.m.id]} className="vt-left">
        <div className="steps">
          {all.map((r, i) => (
            <button key={r.k} type="button" className="step" data-status={r.status} aria-pressed={lead?.k === r.k && level > 1} onClick={() => open(r.k)}>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <Mark s={r.status} />
              <span className="step-t">
                {r.label}
                <small>{STATUS_WORD[r.status]}</small>
              </span>
              <span className="step-v">
                <Num v={r.value} d={r.digits} />
                <small>{r.value != null ? r.unit : ''}</small>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {/* level 1: cyan arc gauges round the body */}
      <AnimatePresence>
        {level === 1 &&
          gauges.map((g, i) => (
            <motion.button key={g.k} type="button" className={`hring hring-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} onClick={() => set({ t: g.t, k: g.k, deep: false })}>
              <Arc g={g.r} size={156} label={g.r.label} />
            </motion.button>
          ))}
      </AnimatePresence>
      {level < 3 && <ViewControls layers style={{ left: 396, bottom: 44 }} />}
      {hover && hoverRow && (
        <div className="hover-read" style={{ left: hover.x + 16, top: hover.y + 16 }}>
          {hoverLabel}
          <b>
            {fmt(hoverRow.value, hoverRow.digits)} {hoverRow.unit}
          </b>
        </div>
      )}
      {!bodyReady && <p className="cx-wait" style={{ position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%' }}>Loading body</p>}

      {/* level 3: the large trend */}
      <AnimatePresence>
        {level === 3 && lead && (
          <motion.div key={lead.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
            <Panel label={`${SHORT[lead.k]} · 3 weeks`} icon="chart" aside={`Usual ${fmt(lead.mean, lead.digits)} ${lead.unit}`} className="vt-chart">
              <Chart values={lead.history} dates={lead.dates} flagged={lead.flagged} g={lead} height={420} />
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel label={level === 1 ? 'Signal' : level === 2 ? (T?.label ?? '') : 'Analysis'} icon={level === 3 ? 'dial' : 'list'} aside={level > 1 ? `Level ${level}` : `${all.length} metrics`} className="vt-right">
        <AnimatePresence mode="wait">
          <motion.div key={`${level}-${target}-${cv.m.id}`} className="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
            {level > 1 && (
              <button type="button" className="cx-back" onClick={() => (level === 3 ? set({ deep: false }) : set({ t: null, k: null }))}>
                <Icon name="back" size={16} />
                Back
              </button>
            )}

            {level === 1 && (
              <div className="meters">
                {all.map((r) => (
                  <Meter key={r.k} r={r} onClick={() => open(r.k)} />
                ))}
              </div>
            )}

            {level === 2 && T && (
              <>
                {rows.map((r) => (
                  <div key={r.k} className="vt-read">
                    <div className="state" data-status={r.status}>
                      <Mark s={r.status} />
                      <span>{r.label}</span>
                      <b style={{ marginLeft: 'auto' }}>{STATUS_WORD[r.status]}</b>
                    </div>
                    <div className="big" style={{ marginTop: 8 }}>
                      <b>
                        <Num v={r.value} d={r.digits} />
                      </b>
                      <small>{r.value != null ? r.unit : ''}</small>
                    </div>
                    <Band g={r} />
                    <dl className="kvs">
                      <KV k="Usual" v={r.mean != null ? `${fmt(r.mean, r.digits)} ${r.unit}` : 'No baseline'} />
                      <KV k="Band" v={r.lo != null && r.hi != null ? `${fmt(r.lo, r.digits)} - ${fmt(r.hi, r.digits)}` : '--'} />
                    </dl>
                  </div>
                ))}
                <button type="button" className="btn btn-primary mt-auto" onClick={() => set({ deep: true })}>
                  Deeper
                </button>
              </>
            )}

            {level === 3 && lead && (
              <>
                <div className="row2" style={{ alignItems: 'center' }}>
                  <Arc g={{ value: lead.z, digits: 1, unit: 'z', status: lead.status, lo: -2, hi: 2, mean: 0 }} size={150} label="z-score" />
                  <dl className="stats" style={{ flex: 1, gridTemplateColumns: '1fr' }}>
                    <div className="st" data-status={lead.status}>
                      <dt>Days running</dt>
                      <dd>{lead.running}</dd>
                    </div>
                    <div className="st">
                      <dt>Today</dt>
                      <dd>
                        {fmt(lead.value, lead.digits)}
                        <small>{lead.unit}</small>
                      </dd>
                    </div>
                  </dl>
                </div>
                <span className="label gap">Related</span>
                <dl className="kvs">
                  {rows
                    .filter((r) => r.k !== lead.k)
                    .concat(all.filter((r) => !TARGET_METRICS[target!].includes(r.k) && r.status !== 'green'))
                    .slice(0, 4)
                    .map((r) => (
                      <KV key={r.k} k={r.label} v={`${fmt(r.value, r.digits)} ${r.unit} · z ${zText(r.z)}`} status={r.status} />
                    ))}
                  <KV k="Usual" v={`${fmt(lead.mean, lead.digits)} ${lead.unit}`} />
                </dl>
                <button
                  type="button"
                  className="btn btn-primary mt-auto"
                  data-done={done[actKey] || undefined}
                  onClick={() => (done[actKey] ? setDone((d) => ({ ...d, [actKey]: false })) : setAsking(true))}
                >
                  {done[actKey] ? 'Logged' : actLabel}
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>

      {lead && (
        <Confirm
          open={asking}
          code={`2.${String(ALL.indexOf(lead.k) + 1).padStart(3, '0')}`}
          title={`${actLabel} ${SHORT[lead.k].toLowerCase()}`}
          tag="Vitals"
          status={`${seat[cv.m.id]} ${STATUS_WORD[lead.status]}`}
          body={lead.action}
          danger={lead.status === 'red'}
          onDone={() => {
            setDone((d) => ({ ...d, [actKey]: true }));
            setAsking(false);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
