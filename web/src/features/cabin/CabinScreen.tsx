// 02 Cabin. The station around the crew: air, water, radiation.
// Air and water: ISS Live! readings (server, else the recorded snapshot) against
// public/samples/cabin_catalog.json. Radiation: crew dose from crew_data.json and
// the storm predictor from storm_forecast.json. No value is written in this file.
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cabinOverall, pressureEmergency, reportsToGround, type Bands, type CabinReading } from '../../core/cabin';
import { doseSummary, sortedEvents } from '../../core/radiation';
import { statusOn } from '../../core/scoring';
import { useCabin } from '../../data/cabin';
import { useMissionData, useMissionStore, useSelectedCrew } from '../../data/store';
import type { AlertLevel, FlareEvent, Status } from '../../data/types';
import { MetricsCard } from '../../concepts/radiation';
import { Shape, StatusTag, Tween } from '../../ui/status';
import './cabin.css';

const FEED_ROWS = 6;
const ALERT: Record<AlertLevel, { status: Status; word: string }> = {
  none: { status: 'green', word: 'Quiet' },
  watch: { status: 'amber', word: 'Watch' },
  warning: { status: 'red', word: 'Warning' },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fixed = (d: number) => (v: number) => v.toFixed(d);
function age(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}
function utc(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm} UTC`;
}

/** Horizontal scale: band zones and a marker at the value. */
function Scale({ value, bands }: { value: number; bands: Bands }) {
  const still = useReducedMotion();
  const edges = [bands.red_low, bands.amber_low, bands.amber_high, bands.red_high].filter((v): v is number => v != null);
  let lo = Math.min(value, ...edges);
  let hi = Math.max(value, ...edges);
  if (bands.red_low == null && bands.amber_low == null) lo = Math.min(0, lo);
  const pad = (hi - lo || 1) * 0.18;
  lo -= bands.red_low == null && bands.amber_low == null ? 0 : pad;
  hi += pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zones: { from: number; to: number; s: Status }[] = [];
  const a = bands.red_low ?? lo;
  const b = bands.amber_low ?? a;
  const c = bands.amber_high ?? hi;
  const d = bands.red_high ?? c;
  if (bands.red_low != null) zones.push({ from: lo, to: a, s: 'red' });
  if (bands.amber_low != null) zones.push({ from: a, to: b, s: 'amber' });
  zones.push({ from: b, to: c, s: 'green' });
  if (bands.amber_high != null) zones.push({ from: c, to: d, s: 'amber' });
  if (bands.red_high != null) zones.push({ from: d, to: hi, s: 'red' });
  return (
    <div className="cb-scale" aria-hidden="true">
      {zones.map((z) => (
        <span key={`${z.s}${z.from}`} className={`cb-zone cb-zone-${z.s}`} style={{ left: `${x(z.from)}%`, width: `${x(z.to) - x(z.from)}%` }} />
      ))}
      <motion.span
        className="cb-marker"
        initial={still ? false : { left: '0%', opacity: 0 }}
        animate={{ left: `${x(value)}%`, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function AirTile({ r, i }: { r: CabinReading; i: number }) {
  const m = r.metric;
  const planned = m.item == null;
  return (
    <motion.article
      className={`cb-tile${planned ? ' is-planned' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="cb-tile-head">
        <span className="fx-label">{m.short}</span>
        <span className={`cb-src cb-src-${m.source.toLowerCase()}`}>{m.source}</span>
      </header>
      {r.value == null ? (
        <p className="cb-empty">{planned ? 'Not connected' : 'No reading'}</p>
      ) : (
        <>
          <p className="cb-value">
            <span className="fx-numeral">
              <Tween value={r.value} format={fixed(m.digits)} />
            </span>
            <small>{m.unit}</small>
          </p>
          {r.status ? <StatusTag status={r.status} size={16} className="cb-status" /> : <span className="cb-status cb-dim">Display only</span>}
          {Object.keys(m.bands).length > 0 && <Scale value={r.value} bands={m.bands} />}
        </>
      )}
      <footer className="cb-tile-foot fx-mono">
        {planned ? (
          <span>Planned</span>
        ) : r.ageHours != null ? (
          <span className={r.stale ? 'cb-stale' : ''}>
            {r.stale ? 'Stale' : 'Age'} {age(r.ageHours)}
          </span>
        ) : null}
        {reportsToGround(r) && <span className="cb-ground">Reported to ground</span>}
      </footer>
    </motion.article>
  );
}

function Tank({ r }: { r: CabinReading }) {
  const still = useReducedMotion();
  const v = r.value;
  const b = r.metric.bands;
  const ticks = [b.red_low, b.amber_low, b.amber_high, b.red_high].filter((t): t is number => t != null);
  return (
    <div className="cb-tank">
      <div className="cb-tank-body" aria-hidden="true">
        {v != null && (
          <motion.span
            className={`cb-tank-fill cb-fill-${r.status ?? 'green'}`}
            initial={still ? false : { height: '0%' }}
            animate={{ height: `${Math.max(0, Math.min(100, v))}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        {ticks.map((t) => (
          <span key={t} className="cb-tank-tick" style={{ bottom: `${t}%` }} />
        ))}
      </div>
      <p className="cb-tank-val">
        {v == null ? '' : <Tween value={v} format={fixed(r.metric.digits)} />}
        <small>{r.metric.unit}</small>
      </p>
      <p className="cb-tank-name">{r.metric.short}</p>
      {r.status && <StatusTag status={r.status} size={14} className="cb-tank-status" />}
      {r.ageHours != null && <p className={`fx-mono cb-dim${r.stale ? ' cb-stale' : ''}`}>{age(r.ageHours)}</p>}
    </div>
  );
}

function FeedRow({ e, watch, warning }: { e: FlareEvent; watch: number; warning: number }) {
  const a = ALERT[e.alert_level];
  const t = Date.parse(e.peak_time);
  const d = new Date(t);
  return (
    <li className="cb-feed-row">
      <span className="fx-mono cb-dim">
        {d.getUTCDate()} {MONTHS[d.getUTCMonth()]} {String(d.getUTCFullYear()).slice(2)}
      </span>
      <span className="cb-flare">{e.flare_class}</span>
      <span className="cb-pbar" aria-label={`Storm probability ${Math.round(e.p_storm * 100)} percent`}>
        <motion.span
          className={`cb-pfill cb-fill-${a.status}`}
          initial={{ width: 0 }}
          animate={{ width: `${e.p_storm * 100}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <span className="cb-ptick" style={{ left: `${watch * 100}%` }} />
        <span className="cb-ptick" style={{ left: `${warning * 100}%` }} />
      </span>
      <span className="fx-mono">{Math.round(e.p_storm * 100)}%</span>
      <span className={`fx-status cb-alert fr-text-${a.status}`}>
        <Shape status={a.status} size={14} />
        {a.word}
      </span>
    </li>
  );
}

export default function CabinScreen() {
  const { data } = useMissionData();
  const member = useSelectedCrew();
  const environment = useMissionStore((s) => s.environment);
  const { cabin, error } = useCabin();

  if (error) return <p className="cb-root cb-error">{error}</p>;
  if (!data || !member || !environment || !cabin) return <div className="cb-root" />;

  const air = cabin.readings.filter((r) => !r.metric.tank);
  const tanks = cabin.readings.filter((r) => r.metric.tank);
  const overall = cabinOverall(cabin.readings);
  const emergency = pressureEmergency(cabin.readings);

  const crew = data.crew;
  const dose = doseSummary(member, crew, environment);
  const scores = statusOn(member, crew, crew.mission.today, environment).scores;
  const doseStatus = (k: 'dose_mSv_day' | 'dose_mSv_cum'): Status | null => scores.find((s) => s.metric === k)?.status ?? null;
  const storm = data.storm;
  const feed = sortedEvents(storm).reverse().slice(0, FEED_ROWS);
  const { watch, warning } = storm.meta.thresholds;

  return (
    <div className="cb-root">
      {emergency && (
        <motion.div className="cb-emergency" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert">
          <Shape status="red" size={22} />
          Cabin pressure low. Reported to ground.
        </motion.div>
      )}

      <header className="cb-head">
        <div className="cb-title">
          <h1 className="fx-title cb-h1">Cabin</h1>
          <StatusTag status={overall} size={20} className="cb-overall" />
        </div>
        <p className="fx-mono cb-origin">
          <span>{cabin.origin === 'server' ? 'ISS Live via e^x server' : 'ISS Live, recorded'}</span>
          <span>{utc(cabin.now)}</span>
          <span className={cabin.signal ? '' : 'cb-stale'}>{cabin.signal ? 'Signal' : 'No signal'}</span>
        </p>
      </header>

      <section className="cb-air" aria-label="Air">
        <p className="cb-sec fx-label">Air</p>
        <div className="cb-tiles">
          {air.map((r, i) => (
            <AirTile key={r.metric.key} r={r} i={i} />
          ))}
        </div>
      </section>

      <section className="cb-water" aria-label="Water">
        <p className="cb-sec fx-label">Water</p>
        <div className="cb-tanks">
          {tanks.map((r) => (
            <Tank key={r.metric.key} r={r} />
          ))}
        </div>
      </section>

      <section className="cb-dose" aria-label="Radiation dose">
        <p className="cb-sec fx-label">Dose / {member.name.split(' ').slice(-1)[0]}</p>
        <div className="cb-dose-today">
          <span className="fx-label">Today</span>
          <p className="cb-value">
            <span className="fx-numeral">{dose.daily_mSv == null ? 'None' : <Tween value={dose.daily_mSv} format={fixed(2)} />}</span>
            <small>mSv</small>
          </p>
          {doseStatus('dose_mSv_day') && <StatusTag status={doseStatus('dose_mSv_day')!} size={16} />}
          <p className="fx-mono cb-dim">
            {crew.environments[environment].label} {dose.environmentDaily_mSv} mSv/day
          </p>
        </div>
        <div className="cb-dose-career">
          <span className="fx-label">Career</span>
          <p className="cb-value">
            <span className="fx-numeral">{dose.cumulative_mSv == null ? 'None' : <Tween value={dose.cumulative_mSv} format={fixed(1)} />}</span>
            <small>of {dose.careerLimit_mSv} mSv</small>
          </p>
          <div className="cb-limit" aria-hidden="true">
            <motion.span
              className={`cb-limit-fill cb-fill-${doseStatus('dose_mSv_cum') ?? 'green'}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (dose.fraction ?? 0) * 100)}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <p className="fx-mono cb-dim">
            {dose.fraction == null ? '' : `${(dose.fraction * 100).toFixed(1)}% of limit`}
            {dose.daysToLimit != null && ` / ${Math.round(dose.daysToLimit).toLocaleString('en-US')} days left`}
          </p>
        </div>
      </section>

      <section className="cb-storm" aria-label="Radiation storm forecast">
        <p className="cb-sec fx-label">Storm forecast / next {storm.meta.horizon_hours} h</p>
        <ol className="cb-feed">
          {feed.map((e) => (
            <FeedRow key={e.flare_id} e={e} watch={watch} warning={warning} />
          ))}
        </ol>
        <p className="fx-mono cb-dim cb-feed-key">
          Watch {Math.round(watch * 100)}% / Warning {Math.round(warning * 100)}% / {storm.meta.model}
        </p>
      </section>

      <section className="cb-model" aria-label="Model">
        <MetricsCard meta={storm.meta} />
        <Link to="/cabin/replay" className="cb-replay fx-press">
          <span>
            <b>Replay May 2024</b>
            <small>Warning before particles arrive</small>
          </span>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 14h19M16 6l8 8-8 8" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
