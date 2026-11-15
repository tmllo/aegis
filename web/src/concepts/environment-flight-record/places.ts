import type { EnvironmentId } from '../../data/types';
import issPlate from './plates/iss.webp';
import moonPlate from './plates/moon.webp';
import transitPlate from './plates/transit.webp';
import marsPlate from './plates/mars.webp';

/**
 * Place facts that are not in crew_data.json. Dose per day and the labels come from the file.
 * Sources (opened 2026-11-15):
 *  - Moon mean distance 384,400 km, light time about 1.28 s: NASA Moon facts, science.nasa.gov/moon/facts
 *  - Mars distance 54.6 to 401 million km, one-way signal 3 to 22 min: NASA Mars facts, science.nasa.gov/mars/facts
 *  - Surface gravity Moon 0.166 g, Mars 0.38 g: NASA planetary fact sheets, nssdc.gsfc.nasa.gov/planetary/factsheet
 *  - ISS orbit about 400 km; crew exercise about 2 h a day: nasa.gov/international-space-station
 *  - Mars transit: 11 min is an example point on the 3 to 22 min range (THESIS-DETAILS section 3C).
 * Coordinates are in the 1600 x 1200 plate space (plates rendered by docs: scratch plates.py, duotone from NASA textures).
 */
export interface Place {
  id: EnvironmentId;
  plate: string;
  /** Hero numeral for the one-way delay and its unit. */
  delay: { value: string; unit: string; seconds: number; example?: boolean };
  line: string;
  distance: string;
  gravity: string;
  shelter: string;
  changes: { label: string; value: string }[];
  /** Craft or base marker, and where Earth sits on the plate (null = Earth is the plate). */
  craft: { x: number; y: number; name: string };
  earth: { x: number; y: number; r: number } | null;
}

export const ORDER: EnvironmentId[] = ['iss', 'moon', 'transit', 'mars'];

export const PLACES: Record<EnvironmentId, Place> = {
  iss: {
    id: 'iss',
    plate: issPlate,
    delay: { value: '<1', unit: 's', seconds: 0.5 },
    line: 'The flight surgeon is live.',
    distance: 'About 400 km up',
    gravity: 'Microgravity',
    shelter: 'Most shielded module',
    changes: [
      { label: 'Who acts', value: 'Flight surgeon, live' },
      { label: 'Reports', value: 'Arrive at once' },
      { label: 'Radiation', value: "Inside Earth's magnetic field" },
      { label: 'Exercise', value: 'About 2 h a day' },
    ],
    craft: { x: 700, y: 430, name: 'Station' },
    earth: null,
  },
  moon: {
    id: 'moon',
    plate: moonPlate,
    delay: { value: '1.3', unit: 's', seconds: 1.28 },
    line: 'Help is seconds away.',
    distance: '384,400 km',
    gravity: '0.17 g',
    shelter: 'Habitat storm shelter',
    changes: [
      { label: 'Who acts', value: 'Flight surgeon, seconds behind' },
      { label: 'Reports', value: 'Arrive in seconds' },
      { label: 'Radiation', value: 'No magnetic field: shelter on warning' },
      { label: 'Exercise', value: 'Daily, one sixth gravity' },
    ],
    craft: { x: 800, y: 1060, name: 'Base' },
    earth: { x: 1410, y: 190, r: 64 },
  },
  transit: {
    id: 'transit',
    plate: transitPlate,
    delay: { value: '11', unit: 'min', seconds: 660, example: true },
    line: 'The crew acts first. Earth advises later.',
    distance: 'About 200 million km',
    gravity: 'Microgravity',
    shelter: 'Vehicle storm shelter',
    changes: [
      { label: 'Who acts', value: 'Crew medical officer' },
      { label: 'Reports', value: 'Queued, 11 min each way' },
      { label: 'Radiation', value: 'No magnetic field: shelter on warning' },
      { label: 'Exercise', value: 'Daily, months without gravity' },
    ],
    craft: { x: 520, y: 800, name: 'Craft' },
    earth: { x: 1430, y: 170, r: 30 },
  },
  mars: {
    id: 'mars',
    plate: marsPlate,
    delay: { value: '3–22', unit: 'min', seconds: 750 },
    line: 'The crew decides. Earth hears later.',
    distance: '55 to 401 million km',
    gravity: '0.38 g',
    shelter: 'Habitat storm shelter',
    changes: [
      { label: 'Who acts', value: 'Crew medical officer' },
      { label: 'Reports', value: 'Queued, 3 to 22 min each way' },
      { label: 'Radiation', value: 'Thin air, no global field: shelter on warning' },
      { label: 'Exercise', value: 'Daily, 0.38 g' },
    ],
    craft: { x: 720, y: 640, name: 'Base' },
    earth: { x: 1450, y: 160, r: 24 },
  },
};

/** Curved path from the craft to Earth (or down to the ground station for the ISS). */
export function signalPath(p: Place): string {
  const a = p.craft;
  const b = p.earth ?? { x: 1080, y: 812 };
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // bow the arc away from the plate centre
  const bow = p.earth ? -0.22 : 0.18;
  const cx = mx + (b.y - a.y) * bow;
  const cy = my - (b.x - a.x) * bow;
  return `M ${a.x} ${a.y} Q ${cx.toFixed(0)} ${cy.toFixed(0)} ${b.x} ${b.y}`;
}

/** Real time when the delay is short; a time-lapse of at most 6 s otherwise. */
export function signalDuration(p: Place): { seconds: number; realTime: boolean } {
  if (p.delay.seconds <= 3) return { seconds: Math.max(p.delay.seconds, 0.6), realTime: true };
  return { seconds: 6, realTime: false };
}
