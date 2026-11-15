// Cabin HUD over the station view: the air table, a radial instrument with readouts at its
// compass points (pressure, ppO2, ppCO2, temperature) and tank sub-dials, and a command list.
// The pressure emergency uses the procedure confirm. Numbers from the cabin feed + catalog.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCabin } from '../data/cabin';
import { cabinOverall, pressureEmergency, reportsToGround, type CabinReading } from '../core/cabin';
import type { Status } from '../data/types';
import { STATUS_WORD } from './model';
import { Arc, Band, Confirm, Icon, KV, Mark, Panel, statusWord } from './ui';

const COMPASS: { key: string; a: number }[] = [
  { key: 'cabin.pressure', a: -90 },
  { key: 'cabin.ppo2', a: 0 },
  { key: 'cabin.ppco2', a: 90 },
  { key: 'cabin.temp', a: 180 },
];

const val = (r: CabinReading) => (r.value == null ? 'Not connected' : r.value.toFixed(r.metric.digits));
const age = (r: CabinReading) => (r.ageHours == null ? '--' : r.ageHours < 1 ? `${Math.round(r.ageHours * 60)} min` : r.ageHours < 48 ? `${r.ageHours.toFixed(1)} h` : `${Math.round(r.ageHours / 24)} d`);
const gauge = (r: CabinReading) => ({ value: r.value, digits: r.metric.digits, unit: r.metric.unit, status: r.status, lo: r.metric.bands.amber_low ?? r.metric.bands.red_low ?? null, hi: r.metric.bands.amber_high ?? r.metric.bands.red_high ?? null });

function Dial({ readings, overall, onPick }: { readings: CabinReading[]; overall: Status; onPick: (k: string) => void }) {
  const C = 300;
  return (
    <svg viewBox="0 0 600 600" className="dial" aria-label="Cabin air">
      {[250, 205, 150, 96].map((r, i) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="rgb(var(--ink))" strokeOpacity={i === 0 ? 0.28 : 0.1} />
      ))}
      {Array.from({ length: 120 }, (_, i) => {
        const a = (i / 120) * Math.PI * 2;
        const major = i % 10 === 0;
        const r0 = 250;
        const r1 = major ? 236 : 243;
        return <line key={i} x1={C + r0 * Math.cos(a)} y1={C + r0 * Math.sin(a)} x2={C + r1 * Math.cos(a)} y2={C + r1 * Math.sin(a)} stroke="rgb(var(--ink))" strokeOpacity={major ? 0.5 : 0.2} />;
      })}
      <line x1={C - 250} x2={C + 250} y1={C} y2={C} stroke="rgb(var(--ink))" strokeOpacity="0.06" />
      <line y1={C - 250} y2={C + 250} x1={C} x2={C} stroke="rgb(var(--ink))" strokeOpacity="0.06" />
      {COMPASS.map(({ key, a }) => {
        const r = readings.find((x) => x.metric.key === key);
        if (!r) return null;
        const rad = (a * Math.PI) / 180;
        const x = C + 180 * Math.cos(rad);
        const y = C + 180 * Math.sin(rad);
        // value position on its band, drawn as a short arc segment on the outer ring
        const g = gauge(r);
        let f = 0.5;
        if (r.value != null && g.lo != null && g.hi != null) f = Math.max(0, Math.min(1, (r.value - (g.lo - (g.hi - g.lo) / 2)) / ((g.hi - g.lo) * 2)));
        else if (r.value != null && (g.lo != null || g.hi != null)) f = g.hi != null ? Math.min(1, r.value / (g.hi * 1.4)) : Math.min(1, 0.5 + (r.value - g.lo!) / (g.lo! * 0.6));
        const a0 = rad - 0.38;
        const a1 = a0 + 0.76 * f;
        const col = !r.status || r.status === 'green' ? 'rgb(var(--accent))' : `rgb(var(--${r.status === 'red' ? 'crit' : 'warn'}))`;
        return (
          <g key={key} onClick={() => onPick(key)} style={{ cursor: 'pointer' }}>
            <path d={`M${C + 222 * Math.cos(a0 - 0.0)} ${C + 222 * Math.sin(a0)} A222 222 0 0 1 ${C + 222 * Math.cos(rad + 0.38)} ${C + 222 * Math.sin(rad + 0.38)}`} fill="none" stroke="rgb(var(--ink))" strokeOpacity="0.12" strokeWidth="6" />
            <path d={`M${C + 222 * Math.cos(a0)} ${C + 222 * Math.sin(a0)} A222 222 0 0 1 ${C + 222 * Math.cos(a1)} ${C + 222 * Math.sin(a1)}`} fill="none" stroke={col} strokeWidth="6" />
            <circle cx={x} cy={y} r="56" className="dial-hit" />
            <text x={x} y={y - 18} textAnchor="middle" className="dial-t">
              {r.metric.short}
            </text>
            <text x={x} y={y + 14} textAnchor="middle" className="dial-v" style={{ fill: r.status && r.status !== 'green' ? col : undefined }}>
              {val(r)}
            </text>
            <text x={x} y={y + 34} textAnchor="middle" className="dial-u">
              {r.value != null ? `${r.metric.unit} · ${r.metric.source}` : ''}
            </text>
          </g>
        );
      })}
      <text x={C} y={C - 8} textAnchor="middle" className="dial-t">
        Cabin
      </text>
      <text x={C} y={C + 24} textAnchor="middle" className="dial-v" style={{ fill: overall !== 'green' ? `rgb(var(--${overall === 'red' ? 'crit' : 'warn'}))` : undefined }}>
        {STATUS_WORD[overall]}
      </text>
    </svg>
  );
}

export default function CabinPage() {
  const { cabin, error } = useCabin();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [sel, setSel] = useState('cabin.ppco2');
  const [ask, setAsk] = useState<null | 'report' | 'recheck' | 'emergency'>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const drill = params.get('drill') === '1';

  if (error) return <p className="cx-error">Cabin feed: {error}</p>;
  if (!cabin) return <p className="cx-error cx-wait">Loading</p>;

  const r = cabin.readings;
  const overall = cabinOverall(r);
  const emergency = pressureEmergency(r);
  const pressure = r.find((x) => x.metric.key === 'cabin.pressure');
  const report = r.filter(reportsToGround);
  const tanks = r.filter((x) => x.metric.tank);
  const s = r.find((x) => x.metric.key === sel) ?? r[0];
  const showEmergency = ask === 'emergency' || emergency;

  return (
    <>
      <Panel label="Air" icon="cabin" aside={cabin.origin === 'server' ? 'Live' : 'Recorded'} className="cb-left">
        <div className="steps">
          {r
            .filter((x) => !x.metric.tank)
            .map((x, i) => (
              <button key={x.metric.key} type="button" className="step" data-status={x.status ?? undefined} aria-pressed={x.metric.key === sel} onClick={() => setSel(x.metric.key)}>
                <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
                <Mark s={x.status} />
                <span className="step-t">
                  {x.metric.short}
                  <small>
                    {x.metric.source} · {x.value == null ? 'no feed' : x.stale ? `stale ${age(x)}` : age(x)}
                  </small>
                </span>
                <span className="step-v">
                  {x.value == null ? <em>Not connected</em> : val(x)}
                  <small>{x.value != null ? x.metric.unit : ''}</small>
                </span>
              </button>
            ))}
        </div>
      </Panel>

      <div className="cb-dial">
        <Dial readings={r} overall={overall} onPick={setSel} />
      </div>
      <div className="cb-tanks">
        {tanks.map((t) => (
          <button key={t.metric.key} type="button" className="hring" style={{ position: "relative" }} onClick={() => setSel(t.metric.key)}>
            <Arc g={gauge(t)} size={128} label={t.metric.short} />
          </button>
        ))}
      </div>

      <div className="cb-right">
        <Panel label="Commands" icon="list" aside="3.0">
          <div className="steps">
            {[
              { id: 'report', n: '3.001', t: 'Report to ground', sub: report.length ? `${report.length} NASA limit crossed` : 'Nothing to report', st: report.length ? ('red' as Status) : null },
              { id: 'recheck', n: '3.002', t: 'Re-check air', sub: `Feed age ${pressure ? age(pressure) : '--'}`, st: null },
              { id: 'emergency', n: '3.003', t: 'Pressure drill', sub: `Floor ${pressure?.metric.emergency_below ?? '--'} mmHg`, st: null },
            ].map((c) => (
              <button key={c.id} type="button" className="step" data-status={c.st ?? undefined} onClick={() => setAsk(c.id as typeof ask)}>
                <span className="step-n">{c.n}</span>
                <Mark s={done[c.id] ? 'green' : c.st} />
                <span className="step-t">
                  {c.t}
                  <small>{c.sub}</small>
                </span>
                <span className="step-v">
                  <em>{done[c.id] ? 'Done' : ''}</em>
                </span>
              </button>
            ))}
            <button type="button" className="step" onClick={() => nav('/storm')}>
              <span className="step-n">3.004</span>
              <Icon name="storm" size={14} />
              <span className="step-t">
                Storm forecast
                <small>Radiation</small>
              </span>
              <span className="step-v" />
            </button>
          </div>
        </Panel>
        <Panel label={s.metric.short} icon="dial" aside={s.metric.source} className="px-grow">
          <div className="state" data-status={s.status ?? undefined} style={{ marginTop: 0 }}>
            <Mark s={s.status} />
            <b>{statusWord(s.status)}</b>
            <span>{s.metric.label}</span>
          </div>
          <div className="big" style={{ marginTop: 10 }}>
            <b>{val(s)}</b>
            <small>{s.value != null ? s.metric.unit : ''}</small>
          </div>
          {s.value != null && <Band g={gauge(s)} />}
          <dl className="kvs gap">
            <KV k="Limit" v={s.metric.source} />
            <KV k="Amber" v={[s.metric.bands.amber_low, s.metric.bands.amber_high].filter((v) => v != null).join(' / ') || '--'} />
            <KV k="Red" v={[s.metric.bands.red_low, s.metric.bands.red_high].filter((v) => v != null).join(' / ') || '--'} />
            <KV k="Age" v={s.stale ? `${age(s)} · stale` : age(s)} status={s.stale ? 'amber' : null} />
            <KV k="Quality" v={s.quality ?? 'no feed'} />
          </dl>
        </Panel>
      </div>

      <Confirm
        open={ask === 'report'}
        code="3.001"
        title="Report to ground"
        tag="Cabin"
        status={report.length ? `${report.length} NASA limit crossed` : 'All NASA limits held'}
        body={report.map((x) => `${x.metric.short} ${val(x)} ${x.metric.unit}`).join(', ') || 'The cabin summary goes with the next downlink.'}
        go="Send"
        onDone={() => {
          setDone((d) => ({ ...d, report: true }));
          setAsk(null);
        }}
        onCancel={() => setAsk(null)}
      />
      <Confirm
        open={ask === 'recheck'}
        code="3.002"
        title="Re-check air"
        tag="Cabin"
        status={`Cabin ${statusWord(overall)}`}
        body="Read the panel values again and compare with this screen."
        onDone={() => {
          setDone((d) => ({ ...d, recheck: true }));
          setAsk(null);
        }}
        onCancel={() => setAsk(null)}
      />
      <Confirm
        open={showEmergency || drill}
        code="3.003"
        title={emergency ? 'Cabin pressure low' : 'Pressure drill'}
        tag={emergency ? 'Emergency' : 'Drill'}
        status={pressure ? `Pressure ${val(pressure)} mmHg` : 'Pressure no feed'}
        body={`Below ${pressure?.metric.emergency_below ?? '--'} mmHg: don masks, go to the safe haven, call ground.`}
        go={emergency ? 'Acknowledge' : 'Done'}
        danger
        onDone={() => {
          setDone((d) => ({ ...d, emergency: true }));
          setAsk(null);
          if (drill) nav('/cabin', { replace: true });
        }}
        onCancel={() => {
          setAsk(null);
          if (drill) nav('/cabin', { replace: true });
        }}
      />
    </>
  );
}
