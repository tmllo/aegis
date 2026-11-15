// Globe lab HUD in the Crew Station style: camera readout, compass, layers, time and presets.
import { useState } from 'react';
import { issAt, useTle } from './iss';
import { labTime, useLab, type LayerKey } from './store';

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'E' : 'W'}`;
const pad = (n: number) => String(n).padStart(2, '0');

const LAYERS: [LayerKey, string][] = [
  ['atmosphere', 'Atmosphere'],
  ['clouds', 'Clouds'],
  ['night', 'Night lights'],
  ['stars', 'Stars'],
  ['milkyway', 'Milky Way'],
  ['grid', 'Grid'],
];

const PRESETS: { id: string; label: string; lat: number; lon: number; altKm: number; tilt: number; heading?: number; follow?: 'iss' }[] = [
  { id: 'jsc', label: 'Houston', lat: 29.56, lon: -95.09, altKm: 900, tilt: 45 },
  { id: 'ksc', label: 'Kennedy', lat: 28.57, lon: -80.65, altKm: 700, tilt: 55 },
  { id: 'bkn', label: 'Baikonur', lat: 45.96, lon: 63.31, altKm: 900, tilt: 45 },
  { id: 'mad', label: 'Madrid', lat: 40.42, lon: -3.7, altKm: 800, tilt: 50 },
];

function Compass({ heading, onClick }: { heading: number; onClick: () => void }) {
  return (
    <button className="gl-btn gl-compass" onClick={onClick} aria-label={`Heading ${Math.round(heading)} degrees. North up`} title="North up (N)">
      <svg viewBox="-20 -20 40 40" width="40" height="40" style={{ transform: `rotate(${-heading}deg)` }} aria-hidden>
        <circle r="17" fill="none" stroke="currentColor" strokeOpacity="0.25" />
        <path d="M0 -15 L4 0 L0 -2 L-4 0 Z" fill="rgb(var(--accent))" />
        <path d="M0 15 L4 0 L0 2 L-4 0 Z" fill="currentColor" fillOpacity="0.4" />
      </svg>
      <span className="gl-n" style={{ transform: `rotate(${-heading}deg) translateY(-27px) rotate(${heading}deg)` }}>N</span>
    </button>
  );
}

export function Hud() {
  const r = useLab((s) => s.readout);
  const date = useLab((s) => s.date);
  const rate = useLab((s) => s.rate);
  const paused = useLab((s) => s.paused);
  const layers = useLab((s) => s.layers);
  const tle = useTle();
  const [open, setOpen] = useState(false);
  const { toggleLayer, setRate, togglePause, setDate, requestFly, requestOrient } = useLab.getState();
  const utc = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;

  return (
    <div className="gl-hud">
      <header className="gl-top">
        <div className="gl-brand">
          e<sup>x</sup> <small>Globe lab</small>
        </div>
        <div className="gl-presets" role="group" aria-label="Fly to">
          <button
            className="gl-chip gl-chip-accent"
            disabled={!tle}
            onClick={() => {
              if (!tle) return;
              // aim where the ISS will be when the flight lands (about 2 s of sim time ahead)
              const p = issAt(tle, labTime.ms + 2000 * useLab.getState().rate);
              requestFly({ lat: p.lat, lon: p.lon, altKm: 1400, tilt: 40, follow: 'iss' });
            }}
          >
            ISS
          </button>
          {PRESETS.map((p) => (
            <button key={p.id} className="gl-chip" onClick={() => requestFly(p)}>
              {p.label}
            </button>
          ))}
          <button className="gl-chip" onClick={() => requestFly({ lat: r.lat, lon: r.lon, altKm: 20000, tilt: 0, heading: 0 })}>
            Full disc
          </button>
        </div>
        <div className="gl-orient">
          <Compass heading={r.heading} onClick={() => requestOrient('north')} />
          <button className="gl-btn" onClick={() => requestOrient('top')} title="Look straight down (U)" aria-label="Look straight down">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M4 16 L12 20 L20 16 M12 4 V20" />
            </svg>
          </button>
        </div>
      </header>

      <aside className="gl-layers" aria-label="Layers" data-open={open}>
        <button className="gl-label" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Layers
        </button>
        {LAYERS.map(([k, label]) => (
          <button key={k} className="gl-row" aria-pressed={layers[k]} onClick={() => toggleLayer(k)}>
            <span className="gl-dot" />
            {label}
          </button>
        ))}
      </aside>

      <footer className="gl-bottom">
        <dl className="gl-readout">
          <div><dt>Lat</dt><dd>{fmtLat(r.lat)}</dd></div>
          <div><dt>Lon</dt><dd>{fmtLon(r.lon)}</dd></div>
          <div><dt>Alt</dt><dd>{Math.round(r.altKm).toLocaleString('en-US')} km</dd></div>
          <div><dt>Hdg</dt><dd>{pad(Math.round(r.heading) % 360).padStart(3, '0')}°</dd></div>
          <div><dt>Tilt</dt><dd>{Math.round(r.tilt)}°</dd></div>
        </dl>
        <div className="gl-time" role="group" aria-label="Simulation time">
          <span className="gl-utc">{utc}</span>
          <button className="gl-chip" onClick={() => setDate(new Date())}>Now</button>
          <button className="gl-chip" aria-pressed={paused} onClick={togglePause}>{paused ? 'Play' : 'Pause'}</button>
          {[1, 60, 3600].map((x) => (
            <button key={x} className="gl-chip" aria-pressed={!paused && rate === x} onClick={() => setRate(x)}>
              {x === 1 ? '1x' : x === 60 ? '60x' : '1 h/s'}
            </button>
          ))}
        </div>
      </footer>
      <p className="gl-credit">Black Marble, Deep Star Maps, CGI Moon Kit: NASA · Earth day (from NASA Blue Marble), relief, water, clouds: Solar System Scope, CC BY 4.0 · Stars: Yale BSC5 · Orbits: CelesTrak (celestrak.org) · Drag to move, scroll to zoom, Shift+drag to tilt</p>
    </div>
  );
}
