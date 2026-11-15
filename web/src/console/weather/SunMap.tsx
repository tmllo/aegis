// The weather map: the Sun, the crew, and the route radiation takes between them, seen from
// above the solar system. One flare at a time. Drawn from the flare's solar longitude and its
// eruption speed (storm_forecast.json) with the Parker-spiral geometry in model.ts.
import { useMemo } from 'react';
import type { EnvironmentId } from '../../data/types';
import { CREW_AU, LEVEL_STATUS, lonText, PLACE, spiralDeg, type Forecast } from './model';

const W = 960;
const H = 600;
const SUN = { x: 150, y: 300, r: 42 };
const R = Math.PI / 180;

export function SunMap({ f, env }: { f: Forecast; env: EnvironmentId }) {
  const crewAu = CREW_AU[env];
  // 1 AU in px: the crew (or Mars, when further out) sits near the right edge
  const S = (W - SUN.x - 150) / Math.max(1, crewAu);
  const at = (au: number, lonDeg: number) => ({ x: SUN.x + au * S * Math.cos(lonDeg * R), y: SUN.y - au * S * Math.sin(lonDeg * R) });
  const rim = (lonDeg: number, k = 1) => ({ x: SUN.x + SUN.r * k * Math.cos(lonDeg * R), y: SUN.y - SUN.r * k * Math.sin(lonDeg * R) });
  const sunAu = SUN.r / S;

  const spiral = (endDeg: number) => {
    // a field line that reaches distance crewAu at longitude endDeg
    const pts: string[] = [];
    for (let k = 0; k <= 60; k++) {
      const r = sunAu + ((crewAu * 1.18 - sunAu) * k) / 60;
      const p = at(r, endDeg + spiralDeg(r, crewAu));
      pts.push(`${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const crewLine = useMemo(() => {
    const pts: string[] = [];
    for (let k = 0; k <= 60; k++) {
      const r = sunAu + ((crewAu - sunAu) * k) / 60;
      const p = at(r, spiralDeg(r, crewAu));
      pts.push(`${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [crewAu, S]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = LEVEL_STATUS[f.level];
  const lon = f.flare.longitude_deg;
  const crew = at(crewAu, 0);
  const earth = at(1, 0);
  const flareP = lon != null ? rim(lon) : null;
  const flareL = lon != null ? rim(lon, 1.9) : null;

  // eruption: a 60 deg wide wedge from the flare site out to the crew's distance
  const wedge = (() => {
    if (!f.front || lon == null) return null;
    const a0 = lon - 30;
    const a1 = lon + 30;
    const rr = crewAu * S;
    const p0 = rim(a0);
    const p1 = at(crewAu, a0);
    const p2 = at(crewAu, a1);
    const p3 = rim(a1);
    return {
      area: `M${p0.x} ${p0.y} L${p1.x} ${p1.y} A${rr} ${rr} 0 0 0 ${p2.x} ${p2.y} L${p3.x} ${p3.y} Z`,
      front: `M${p1.x} ${p1.y} A${rr} ${rr} 0 0 0 ${p2.x} ${p2.y}`,
      label: at(crewAu * 0.66, lon - 17),
      hits: Math.abs(lon) <= 30,
    };
  })();

  const active = f.level !== 'none';
  return (
    <svg className="wx-map" viewBox={`0 0 ${W} ${H}`} data-status={status} role="img" aria-label={`Map from the Sun to the crew. Solar flare ${f.flare.flare_class} at ${lonText(lon)}. ${f.conn ? `Path to the crew: ${f.conn.path}.` : ''}`}>
      <defs>
        <radialGradient id="wx-glow" cx={SUN.x} cy={SUN.y} r="290" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc46b" stopOpacity="0.55" />
          <stop offset="0.22" stopColor="#ff9a4d" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#7a5cff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#7a5cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="wx-sun" cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#fffdf2" />
          <stop offset="0.45" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#ff8f3d" />
        </radialGradient>
        <radialGradient id="wx-earth" cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#bfe6ff" />
          <stop offset="0.55" stopColor="#4a9dff" />
          <stop offset="1" stopColor="#1c4fc4" />
        </radialGradient>
        <filter id="wx-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="wx-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <circle cx={SUN.x} cy={SUN.y} r="290" fill="url(#wx-glow)" />

      {/* orbits */}
      <circle cx={SUN.x} cy={SUN.y} r={S} className="wx-orbit" />
      {crewAu > 1 && <circle cx={SUN.x} cy={SUN.y} r={crewAu * S} className="wx-orbit" />}

      {/* the Sun's magnetic field, wound into a spiral by the solar wind */}
      {[-160, -128, -96, -64, -32, 32, 64, 96, 128, 160].map((d, k) => (
        <path key={d} d={spiral(d)} className="wx-field" style={{ animationDelay: `${-k * 0.7}s` }} />
      ))}

      {/* eruption cloud */}
      {wedge && (
        <g>
          <path d={wedge.area} className="wx-cloud" filter="url(#wx-soft)" />
          <path d={wedge.front} className="wx-front" />
          <text x={wedge.label.x} y={wedge.label.y} className="wx-t wx-t-status" textAnchor="middle">
            <tspan x={wedge.label.x}>Eruption cloud</tspan>
            <tspan x={wedge.label.x} dy="20">
              arrives in about {Math.round(f.front!.hours)} h
            </tspan>
          </text>
        </g>
      )}

      {/* the field line that ends at the crew: the road fast particles take */}
      <path d={crewLine} className="wx-road-glow" filter="url(#wx-blur)" />
      <path d={crewLine} className="wx-road" />
      <path d={crewLine} className="wx-flow" data-active={active} />

      {/* the Sun */}
      <circle cx={SUN.x} cy={SUN.y} r={SUN.r * 1.7} fill="#ffb054" opacity="0.35" filter="url(#wx-blur)" />
      <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#wx-sun)" />
      <text x={SUN.x} y={SUN.y + SUN.r + 30} className="wx-t" textAnchor="middle">
        Sun
      </text>
      {flareP && flareL && (
        <g>
          <line x1={flareP.x} y1={flareP.y} x2={flareL.x} y2={flareL.y} className="wx-lead" />
          <circle cx={flareP.x} cy={flareP.y} r="16" className="wx-flare-glow" filter="url(#wx-soft)" />
          <circle cx={flareP.x} cy={flareP.y} r="8" className="wx-flare" />
          <text x={flareL.x} y={flareL.y + (lon! >= 0 ? -10 : 22)} className="wx-t wx-t-status" textAnchor={Math.abs(lon!) > 100 ? 'end' : 'start'}>
            Solar flare {f.flare.flare_class}
          </text>
        </g>
      )}

      {/* Earth and the crew */}
      {crewAu > 1 && (
        <g>
          <circle cx={earth.x} cy={earth.y} r="9" fill="url(#wx-earth)" />
          <text x={earth.x} y={earth.y + 26} className="wx-t wx-t-dim" textAnchor="middle">
            Earth
          </text>
        </g>
      )}
      <g>
        <circle cx={crew.x} cy={crew.y} r="22" className="wx-crew-ring" />
        <circle cx={crew.x} cy={crew.y} r="22" className="wx-crew-ping" data-active={active} />
        {crewAu === 1 ? <circle cx={crew.x} cy={crew.y} r="11" fill="url(#wx-earth)" /> : <circle cx={crew.x} cy={crew.y} r="6" className="wx-crew" />}
        <text x={crew.x + 34} y={crew.y - 4} className="wx-t">
          Crew
        </text>
        <text x={crew.x + 34} y={crew.y + 15} className="wx-t wx-t-dim">
          {PLACE[env]}
          {crewAu === 1 ? ' · at Earth' : ''}
        </text>
      </g>

      <text x={at(crewAu * 0.5, spiralDeg(crewAu * 0.5, crewAu)).x + 14} y={at(crewAu * 0.5, spiralDeg(crewAu * 0.5, crewAu)).y - 16} className="wx-t wx-t-dim">
        Radiation travels along this line
      </text>
    </svg>
  );
}
