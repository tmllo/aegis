// The weather map: the Sun, the crew, and the route radiation takes between them, seen from
// above the solar system. One flare at a time. Drawn from the flare's solar longitude and its
// eruption speed (storm_forecast.json) with the Parker-spiral geometry in model.ts.
import { useMemo } from 'react';
import type { EnvironmentId } from '../../data/types';
import { CREW_AU, footpointDeg, LEVEL_STATUS, lonText, PLACE, spiralDeg, type Forecast } from './model';

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
  const foot = footpointDeg(crewAu);
  const crew = at(crewAu, 0);
  const earth = at(1, 0);
  const flareP = lon != null ? rim(lon) : null;
  const flareL = lon != null ? rim(lon, 1.9) : null;
  const footP = rim(foot);

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
      label: at(crewAu * 0.62, lon),
      hits: Math.abs(lon) <= 30,
    };
  })();

  const active = f.level !== 'none';
  return (
    <svg className="wx-map" viewBox={`0 0 ${W} ${H}`} data-status={status} role="img" aria-label={`Map from the Sun to the crew. Solar flare ${f.flare.flare_class} at ${lonText(lon)}. ${f.conn ? `Path to the crew: ${f.conn.path}.` : ''}`}>
      {/* orbits */}
      <circle cx={SUN.x} cy={SUN.y} r={S} className="wx-orbit" />
      {crewAu > 1 && <circle cx={SUN.x} cy={SUN.y} r={crewAu * S} className="wx-orbit" />}

      {/* the Sun's magnetic field, wound into a spiral by the solar wind */}
      {[-150, -100, -50, 50, 100, 150].map((d) => (
        <path key={d} d={spiral(d)} className="wx-field" />
      ))}

      {/* eruption cloud */}
      {wedge && (
        <g>
          <path d={wedge.area} className="wx-cloud" />
          <path d={wedge.front} className="wx-front" />
          <text x={wedge.label.x} y={wedge.label.y} className="wx-t wx-t-status" textAnchor="middle">
            <tspan x={wedge.label.x}>Eruption cloud</tspan>
            <tspan x={wedge.label.x} dy="18">
              {Math.round(f.front!.kms).toLocaleString('en-US')} km/s · {Math.round(f.front!.hours)} h to the crew’s distance
            </tspan>
          </text>
        </g>
      )}

      {/* the field line that ends at the crew: the road fast particles take */}
      <path d={crewLine} className="wx-road" />
      {active && <path d={crewLine} className="wx-flow" />}

      {/* the Sun */}
      <circle cx={SUN.x} cy={SUN.y} r={SUN.r} className="wx-sun" />
      <text x={SUN.x} y={SUN.y + 5} className="wx-t" textAnchor="middle">
        Sun
      </text>
      <circle cx={footP.x} cy={footP.y} r="6" className="wx-foot" />
      {flareP && flareL && (
        <g>
          <line x1={flareP.x} y1={flareP.y} x2={flareL.x} y2={flareL.y} className="wx-lead" />
          <circle cx={flareP.x} cy={flareP.y} r="8" className="wx-flare" />
          <text x={flareL.x} y={flareL.y + (lon! >= 0 ? -10 : 22)} className="wx-t wx-t-status" textAnchor={Math.abs(lon!) > 100 ? 'end' : 'start'}>
            Flare {f.flare.flare_class} · {lonText(lon)}
          </text>
        </g>
      )}

      {/* Earth and the crew */}
      {crewAu > 1 && (
        <g>
          <circle cx={earth.x} cy={earth.y} r="6" className="wx-earth" />
          <text x={earth.x} y={earth.y + 26} className="wx-t wx-t-dim" textAnchor="middle">
            Earth
          </text>
        </g>
      )}
      <g>
        <rect x={crew.x - 13} y={crew.y - 13} width="26" height="26" className="wx-crew-box" />
        <circle cx={crew.x} cy={crew.y} r="6" className="wx-crew" />
        <text x={crew.x + 24} y={crew.y - 4} className="wx-t">
          Crew
        </text>
        <text x={crew.x + 24} y={crew.y + 15} className="wx-t wx-t-dim">
          {PLACE[env]}
          {crewAu === 1 ? ' · at Earth' : ''}
        </text>
      </g>

      {/* reading aids */}
      <text x={at(crewAu * 0.5, spiralDeg(crewAu * 0.5, crewAu)).x + 14} y={at(crewAu * 0.5, spiralDeg(crewAu * 0.5, crewAu)).y - 14} className="wx-t wx-t-dim">
        Radiation follows this magnetic line
      </text>
      <g className="wx-scale">
        <line x1={SUN.x} y1={H - 34} x2={SUN.x + S} y2={H - 34} />
        <line x1={SUN.x} y1={H - 40} x2={SUN.x} y2={H - 28} />
        <line x1={SUN.x + S} y1={H - 40} x2={SUN.x + S} y2={H - 28} />
        <text x={SUN.x + S / 2} y={H - 12} className="wx-t wx-t-dim" textAnchor="middle">
          150 million km · Sun to Earth
        </text>
      </g>
    </svg>
  );
}
