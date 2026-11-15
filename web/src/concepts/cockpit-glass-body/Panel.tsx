// Right-hand panel: crew overview when nothing is picked, one metric against the
// person's own baseline when a region is picked. One primary action on the bottom edge.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CrewMember, MetricKey, Region, Status } from '../../data/types';
import { REGIONS } from '../../data/types';
import { conceptIds } from '../../registry';
import { Icon, Shape, useRoll, useSize } from './bits';
import { REGION_WORD, STATUS_WORD, fmt, isStandIn, shortLabel, sourceChain, traceStats, type CrewView, type MetricView } from './model';

const decimals = (v: number): number => (String(v).split('.')[1] ?? '').length;
export const ARCH_ID = conceptIds.find((id) => /^cockpit-glass-(arch|system|map|data)/.test(id));

/* --------------------------------------------------------------- overview */

/** 14-day line with the quiet band behind it, small enough to sit inside an issue row. */
function Spark({ m }: { m: MetricView }) {
  const W = 160;
  const H = 44;
  const vals = m.trace.map((t) => t.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <span />;
  const showBand = m.band.kind === 'baseline';
  const lo = Math.min(...vals, showBand ? m.band.from : Infinity);
  const hi = Math.max(...vals, showBand ? m.band.to : -Infinity);
  const n = m.trace.length;
  const x = (i: number) => 4 + (i / Math.max(1, n - 1)) * (W - 8);
  const y = (v: number) => 5 + (1 - (v - lo) / (hi - lo || 1)) * (H - 10);
  const pts = m.trace.flatMap((t, i) => (t.value == null ? [] : [`${x(i).toFixed(1)},${y(t.value).toFixed(1)}`]));
  const last = m.trace[n - 1];
  return (
    <svg className="cg-spark" data-status={m.status} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {showBand && <rect className="cg-trace-band" x={0} width={W} y={y(m.band.to)} height={Math.max(1, y(m.band.from) - y(m.band.to))} />}
      <polyline className="cg-trace-line" points={pts.join(' ')} vectorEffect="non-scaling-stroke" />
      {last?.value != null && <circle className="cg-trace-now" cx={x(n - 1)} cy={y(last.value)} r={4} />}
    </svg>
  );
}

const trendWord = (m: MetricView): string =>
  m.direction === 'inside' ? 'In range' : `${m.direction === 'above' ? 'Above' : 'Below'} ${m.band.kind === 'baseline' ? 'baseline' : 'limit'}`;

/** Only what is out of range gets a row. The quiet regions are one line: the ring already names them. */
export function Overview({ crew, view, onRegion }: { crew: CrewMember; view: CrewView; onRegion: (r: Region) => void }) {
  const first = view.flagged[0];
  const quiet = REGIONS.filter((r) => view.regions[r].status === 'green').length;
  return (
    <div className="cg-pane" key={crew.id}>
      <header className="cg-pane-head">
        <div>
          <p className="cg-label">{crew.role}</p>
          <h2 className="cg-title">{crew.name}</h2>
        </div>
      </header>

      <div className="cg-overall" data-status={view.overall}>
        <Shape status={view.overall} size={44} />
        <p className="cg-hero">{STATUS_WORD[view.overall]}</p>
        <p className="cg-overall-count">
          <span className="cg-num">{view.flagged.length}</span>
          <span className="cg-unit"> / {view.total}</span>
          <span className="cg-label">Out of range</span>
        </p>
      </div>

      <div className="cg-issues">
        <ul className="cg-rows">
          {view.flagged.map((m) => (
            <li key={m.key}>
              <button className="cg-row" data-status={m.status} onClick={() => onRegion(m.meta.body_region)}>
                <Shape status={m.status} size={20} />
                <span className="cg-row-where">
                  <span className="cg-row-word">{REGION_WORD[m.meta.body_region]}</span>
                  <span className="cg-row-metric">{shortLabel(m.key, m.meta)}</span>
                </span>
                <Spark m={m} />
                <span className="cg-row-reading">
                  <span className="cg-row-value">
                    {m.score ? fmt(m.score.value) : 'No reading'}
                    {m.score && <i>{m.meta.unit}</i>}
                  </span>
                  <span className="cg-row-metric">
                    {trendWord(m)}, {m.days} {m.days === 1 ? 'day' : 'days'}
                  </span>
                </span>
                <Icon name="right" size={20} />
              </button>
            </li>
          ))}
        </ul>
        {quiet > 0 && (
          <p className="cg-quiet">
            <Shape status="green" size={14} />
            {quiet === REGIONS.length ? 'All' : quiet} {quiet === 1 ? 'region' : 'regions'} nominal
          </p>
        )}
      </div>

      <div className="cg-actions">
        {first && (
          <button className="cg-btn cg-btn-primary" onClick={() => onRegion(first.meta.body_region)}>
            <Shape status={first.status} size={18} />
            Review {REGION_WORD[first.meta.body_region]}
          </button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- detail */

function Strip({ m }: { m: MetricView }) {
  const { band, score } = m;
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - band.lo) / (band.hi - band.lo)) * 100))}%`;
  const limit = band.kind === 'limit';
  // Limit metrics show both thresholds on one track: where Watch starts and where Act starts.
  const actFrom = m.meta.absolute_red.max;
  return (
    <div className="cg-strip" data-status={m.status} data-kind={band.kind}>
      <div className="cg-strip-head">
        {limit ? (
          <>
            <span className="cg-label">
              <Shape status="amber" size={10} /> {STATUS_WORD.amber} from {fmt(band.to)} <i className="cg-u">{m.meta.unit}</i>
            </span>
            <span className="cg-label">
              <Shape status="red" size={10} /> {STATUS_WORD.red} from {fmt(actFrom)} <i className="cg-u">{m.meta.unit}</i>
            </span>
          </>
        ) : (
          <>
            <span className="cg-label">Your baseline</span>
            <span className="cg-label">
              {fmt(band.from)} to {fmt(band.to)} <i className="cg-u">{m.meta.unit}</i>
            </span>
          </>
        )}
      </div>
      <div className="cg-strip-track">
        <div className="cg-strip-band" style={{ left: pct(band.from), right: `calc(100% - ${pct(band.to)})` }} />
        {band.mean != null && <div className="cg-strip-mean" style={{ left: pct(band.mean) }} />}
        {limit && <div className="cg-strip-tick" data-status="amber" style={{ left: pct(band.to) }} />}
        {limit && <div className="cg-strip-tick" data-status="red" style={{ left: pct(actFrom) }} />}
        {score && (
          <div className="cg-strip-today" style={{ left: pct(score.value) }}>
            <Shape status={m.status} size={14} />
            <i />
          </div>
        )}
      </div>
    </div>
  );
}

/** The trace takes whatever height the panel has left, so no state leaves a void above the actions. */
function Trace({ m }: { m: MetricView }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const H = Math.max(48, h);
  const pad = 10;
  const vals = m.trace.map((t) => t.value).filter((v): v is number => v != null);
  const stats = traceStats(m.trace);
  const showBand = m.band.kind === 'baseline';
  const lo = Math.min(...vals, showBand ? m.band.from : Infinity);
  const hi = Math.max(...vals, showBand ? m.band.to : -Infinity);
  const span = hi - lo || 1;
  const n = m.trace.length;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const pts = m.trace.flatMap((t, i) => (t.value == null ? [] : [`${x(i).toFixed(1)},${y(t.value).toFixed(1)}`]));
  const last = m.trace[n - 1];
  return (
    <div className="cg-trace" data-status={m.status}>
      <div className="cg-strip-head">
        <span className="cg-label">{n} days</span>
        {stats && (
          <span className="cg-label cg-trace-stats">
            Low <b>{fmt(stats.min)}</b> Mean <b>{fmt(stats.mean)}</b> High <b>{fmt(stats.max)}</b>
          </span>
        )}
      </div>
      <div className="cg-trace-plot" ref={ref}>
        {w > 0 && h > 0 && vals.length > 0 && (
          <svg width={w} height={H} role="img" aria-label={`${m.meta.label}, last ${n} days`}>
            {showBand && <rect className="cg-trace-band" x={0} width={w} y={y(m.band.to)} height={Math.max(1, y(m.band.from) - y(m.band.to))} />}
            {showBand && m.band.mean != null && <line className="cg-trace-mean" x1={0} x2={w} y1={y(m.band.mean)} y2={y(m.band.mean)} />}
            <polyline className="cg-trace-line" points={pts.join(' ')} />
            {m.trace.map((t, i) => (t.value == null ? null : <circle key={t.date} className="cg-trace-pt" cx={x(i)} cy={y(t.value)} r={2} />))}
            {last?.value != null && <circle className="cg-trace-now" cx={x(n - 1)} cy={y(last.value)} r={5} />}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Press and hold for 800 ms. Releasing early cancels: escalation is the one action with no undo. */
function HoldButton({ label, doneLabel, done, onDone }: { label: string; doneLabel: string; done: boolean; onDone: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setP(0);
  };
  const start = () => {
    if (done) return;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800);
      setP(k);
      if (k >= 1) {
        onDone();
        setP(0);
      } else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const C = 2 * Math.PI * 15;
  return (
    <div className="cg-hold-frame">
      <button
        className="cg-btn cg-btn-hold"
        data-done={done}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
        onKeyUp={stop}
      >
        {done ? (
          <Icon name="check" size={28} />
        ) : (
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
            <circle className="cg-hold-ring" cx="20" cy="20" r="15" />
            <circle className="cg-hold-fill" cx="20" cy="20" r="15" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 20 20)" />
            <rect className="cg-hold-core" x="15" y="15" width="10" height="10" />
          </svg>
        )}
        {done ? doneLabel : label}
      </button>
    </div>
  );
}

/** One step of the source chain: a glove-sized cell that opens its node on the data map. */
function ChainStep({ n, step, crewId }: { n: ReturnType<typeof sourceChain>[number]; step: number; crewId: string }) {
  const body = (
    <>
      <span className="cg-chain-step">{step}</span>
      <span className="cg-chain-name">{n.label}</span>
      <span className="cg-chain-kind">{n.status}</span>
    </>
  );
  return ARCH_ID ? (
    <Link className="cg-chain-cell" data-kind={n.status} to={`/concepts/${ARCH_ID}?node=${n.id}&crew=${crewId}`}>
      {body}
    </Link>
  ) : (
    <div className="cg-chain-cell" data-kind={n.status}>
      {body}
    </div>
  );
}

type Done = Partial<Record<'remeasure' | 'flag' | 'escalate', boolean>>;

export function Detail(props: {
  crew: CrewMember;
  view: CrewView;
  region: Region;
  metric: MetricKey;
  reduced: boolean;
  /** Mission day, stamped on what the crew member logs here. */
  day: number;
  showSource: boolean;
  onSource: (on: boolean) => void;
  onMetric: (k: MetricKey) => void;
  onBack: () => void;
}) {
  const { crew, view, region, metric, reduced, day, showSource, onSource, onMetric, onBack } = props;
  const rv = view.regions[region];
  const m = rv.metrics.find((x) => x.key === metric) ?? rv.metrics[0];
  const [done, setDone] = useState<Record<string, Done>>({});
  const id = `${crew.id}:${m.key}`;
  const mine = done[id] ?? {};
  const mark = (k: keyof Done) => setDone((d) => ({ ...d, [id]: { ...d[id], [k]: true } }));
  const rolled = useRoll(m.score?.value ?? null, reduced);
  const status: Status = m.status;
  const severity = status === 'green' ? null : status;
  const chain = showSource ? sourceChain(m.key) : [];
  const trend = trendWord(m);
  // What this press did and when: the newest entry wins the one line.
  const logged = mine.escalate ? 'Queued for flight surgeon' : mine.flag ? 'Flagged for next conference' : mine.remeasure ? 'Re-measure queued' : null;

  return (
    <div className="cg-pane" key={`${crew.id}:${region}`}>
      <header className="cg-pane-head">
        <button className="cg-square" onClick={onBack} aria-label="Back to crew overview">
          <Icon name="left" />
        </button>
        <div className="cg-pane-where">
          <p className="cg-label">{REGION_WORD[region]}</p>
          <h2 className="cg-title">{m.meta.label}</h2>
        </div>
        <p className="cg-state" data-status={status}>
          <Shape status={status} size={22} />
          {STATUS_WORD[status]}
        </p>
      </header>

      {rv.metrics.length > 1 && (
        <div className="cg-tabs" role="tablist">
          {rv.metrics.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === m.key} className="cg-tab" onClick={() => onMetric(x.key)}>
              <Shape status={x.status} size={12} />
              {shortLabel(x.key, x.meta)}
            </button>
          ))}
        </div>
      )}

      <div className="cg-body" key={m.key}>
        <div className="cg-reading">
          <p className="cg-hero" data-status={status}>
            {rolled == null ? 'No reading' : rolled.toFixed(decimals(m.score?.value ?? 0))}
            {rolled != null && <span className="cg-hero-unit">{m.meta.unit}</span>}
          </p>
          <div className="cg-trend" data-status={status}>
            <p>
              <Icon name={m.direction === 'above' ? 'up' : m.direction === 'below' ? 'down' : 'level'} size={22} />
              {trend}
            </p>
            <p className="cg-trend-days">
              {m.days > 0 ? (
                <>
                  <span className="cg-num-sm">{m.days}</span> {m.days === 1 ? 'day' : 'days'} running
                </>
              ) : (
                'No drift'
              )}
            </p>
          </div>
        </div>

        <Strip m={m} />

        {showSource ? (
          <div className="cg-source">
            <p className="cg-label">Source</p>
            <ol className="cg-chain" aria-label="Where this value comes from">
              {chain.map((n, i) => (
                <li key={n.id}>
                  <ChainStep n={n} step={i + 1} crewId={crew.id} />
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <Trace m={m} />
        )}

        {!showSource && (
          <p className="cg-explain">
            {m.meta.explain.split(/(?<=\.)\s/)[0]}
            {isStandIn(m.map) && <span className="cg-note">Placement illustrative</span>}
          </p>
        )}

        <div className="cg-action" data-status={status}>
          <p className="cg-label">Action</p>
          <p>{severity ? m.meta.actions[severity] : 'No action'}</p>
          {logged && (
            <p className="cg-log" role="status">
              <Icon name="check" size={18} />
              {logged}, day {day}
            </p>
          )}
        </div>
      </div>

      <div className="cg-actions" data-red={status === 'red'}>
        <button className="cg-btn cg-btn-source" aria-pressed={showSource} onClick={() => onSource(!showSource)}>
          <Icon name="source" />
          Source
        </button>
        {status === 'green' ? (
          <button className="cg-btn cg-btn-primary" data-done={!!mine.remeasure} onClick={() => mark('remeasure')}>
            <Icon name={mine.remeasure ? 'check' : 'redo'} />
            {mine.remeasure ? 'Re-measure queued' : 'Re-measure'}
          </button>
        ) : (
          <>
            <button className="cg-btn" data-done={!!mine.remeasure} onClick={() => mark('remeasure')}>
              <Icon name={mine.remeasure ? 'check' : 'redo'} />
              {mine.remeasure ? 'Queued' : 'Re-measure'}
            </button>
            {status === 'amber' ? (
              <button className="cg-btn cg-btn-primary" data-done={!!mine.flag} onClick={() => mark('flag')}>
                {mine.flag && <Icon name="check" />}
                {mine.flag ? 'Flagged' : 'Flag for conference'}
              </button>
            ) : (
              <HoldButton label="Hold to escalate" doneLabel="Escalated" done={!!mine.escalate} onDone={() => mark('escalate')} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
