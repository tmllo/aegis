// Space-weather forecast model for the crew screen (pure, testable). It turns one solar flare
// from storm_forecast.json into a picture an astronaut can read: where the radiation starts, the
// path it takes to the crew, how direct that path is, and what to do.
//
// Geometry: a top view of the solar system from the north. Angles are heliographic longitude
// seen from Earth, west positive (the Sun turns counter-clockwise from the north, so west is the
// leading side). The Sun-Earth line is 0 deg. Fast particles follow the Sun's magnetic field,
// which the solar wind winds into a Parker spiral: phi(r) = phi_foot - OMEGA * r / v_wind.
import type { CrewData, CrewMember, EnvironmentId, FlareEvent, StormForecast } from '../../data/types';

export const AU_KM = 149_597_871;
/** Solar sidereal rotation rate (25.38 days), rad/s. */
export const OMEGA = (2 * Math.PI) / (25.38 * 86400);
/** Nominal slow solar wind, km/s. */
export const WIND_KMS = 400;
const D = 180 / Math.PI;

/** Crew distance from the Sun by mission location, AU (transit: a mid-cruise point). */
export const CREW_AU: Record<EnvironmentId, number> = { iss: 1, moon: 1, transit: 1.25, mars: 1.52 };
export const PLACE: Record<EnvironmentId, string> = { iss: 'ISS', moon: 'Moon', transit: 'Mars transit', mars: 'Mars' };
/** What stands between the crew and the radiation (general physics, not mission data). */
export const SHIELD: Record<EnvironmentId, { word: string; why: string }> = {
  iss: { word: 'Strong', why: "Earth's magnetic field deflects most of it" },
  moon: { word: 'None', why: 'no magnetic field and no air' },
  transit: { word: 'None', why: 'open space, only the cabin walls' },
  mars: { word: 'Partial', why: 'thin air, no global magnetic field' },
};

/** Longitude (deg west) where the field line through a point at `au` leaves the Sun. */
export const footpointDeg = (au: number, wind = WIND_KMS) => ((OMEGA * au * AU_KM) / wind) * D;

/** Longitude (deg west) of the field line that ends at the crew, at distance r (AU) from the Sun. */
export const spiralDeg = (rAu: number, crewAu: number, wind = WIND_KMS) => footpointDeg(crewAu, wind) * (1 - rAu / crewAu);

export type Path = 'direct' | 'partial' | 'side';
export interface Connection {
  /** Angle between the flare and the start of the crew's field line, degrees. */
  gapDeg: number;
  footDeg: number;
  path: Path;
}

/** How directly a flare at `lonDeg` (west positive) is wired to the crew. */
export function connection(lonDeg: number | null, env: EnvironmentId): Connection | null {
  if (lonDeg == null) return null;
  const footDeg = footpointDeg(CREW_AU[env]);
  const gapDeg = Math.abs(lonDeg - footDeg);
  return { gapDeg, footDeg, path: gapDeg <= 30 ? 'direct' : gapDeg <= 70 ? 'partial' : 'side' };
}
export const PATH_WORD: Record<Path, string> = { direct: 'Direct', partial: 'Partial', side: 'Off to the side' };

/** Hours for an eruption front moving at `kms` to reach the crew. */
export const frontHours = (kms: number, env: EnvironmentId) => (CREW_AU[env] * AU_KM) / kms / 3600;

export type Level = 'none' | 'watch' | 'warning';
export const LEVEL_WORD: Record<Level, string> = { none: 'Quiet', watch: 'Watch', warning: 'Warning' };
export const LEVEL_DO: Record<Level, string> = { none: 'No action needed', watch: 'Stay within reach of the shelter', warning: 'Go to the shelter' };
export const LEVEL_STATUS: Record<Level, 'green' | 'amber' | 'red'> = { none: 'green', watch: 'amber', warning: 'red' };

/** Dose above a normal day on the worst storm day in the crew series (simulated mission), mSv. */
export function stormExtraDose(m: Pick<CrewMember, 'series'>, cd: CrewData, env: EnvironmentId): { extra: number; date: string } | null {
  const rows = m.series.filter((r) => r.dose_mSv_day != null);
  if (!rows.length) return null;
  const worst = rows.reduce((a, b) => (b.dose_mSv_day! > a.dose_mSv_day! ? b : a));
  const extra = worst.dose_mSv_day! - cd.environments[env].dose_mSv_day;
  return extra > 0.2 ? { extra, date: worst.date } : null;
}

export interface Forecast {
  flare: FlareEvent;
  level: Level;
  chancePct: number;
  conn: Connection | null;
  /** Eruption speed and travel time to the crew, when the flare threw one. */
  front: { kms: number; hours: number } | null;
  typicalWarningH: number;
}

export function forecastFor(flare: FlareEvent, storm: StormForecast, env: EnvironmentId): Forecast {
  return {
    flare,
    level: flare.alert_level as Level,
    chancePct: Math.round(flare.p_storm * 100),
    conn: connection(flare.longitude_deg, env),
    front: flare.has_linked_cme && flare.cme_speed_kms ? { kms: flare.cme_speed_kms, hours: frontHours(flare.cme_speed_kms, env) } : null,
    typicalWarningH: storm.meta.metrics_test.median_lead_time_h,
  };
}

/** "46° W" / "35° E" / "centre". */
export const lonText = (lon: number | null) => (lon == null ? 'unknown' : Math.abs(lon) < 1 ? 'centre' : `${Math.round(Math.abs(lon))}° ${lon > 0 ? 'W' : 'E'}`);
