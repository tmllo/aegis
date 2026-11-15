// Simulated wrist band (Actiwatch / Bio-Monitor class): a pure, seeded generator of what a real band
// streams once a second. It starts from the crew member's own baseline (crew_data.json), so a "normal"
// member reads normal and the numbers agree with the rest of the app. No DOM; tested in wristSim.test.ts.

export interface WristReading {
  /** ms since the stream started */
  t: number;
  /** heart rate, bpm */
  hr: number;
  /** blood oxygen, % */
  spo2: number;
  /** skin temperature at the wrist, deg C (lower than core) */
  skinTemp: number;
  /** steps since the stream started */
  steps: number;
  /** 0..100 */
  battery: number;
}

export interface WristSimOptions {
  /** resting heart-rate baseline for this member (mean, sd); default 62 +- 4 */
  hrMean?: number;
  hrSd?: number;
  seed?: number;
  /** 0 = resting, 1 = exercise block; changes HR and steps */
  activity?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Returns next(dtMs) -> reading. Physiology: HR follows a slow drift around the baseline plus
 *  respiratory sinus arrhythmia (about 15 breaths a minute) and beat noise; activity raises HR
 *  towards ~125 bpm and adds steps; SpO2 sits at 96-99 %; battery drains about 1 % per 10 min. */
export function createWristSim({ hrMean = 62, hrSd = 4, seed = 1, activity = 0 }: WristSimOptions = {}) {
  const rand = rng(seed);
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  let t = 0;
  let drift = 0;
  let steps = 0;
  let level = activity;
  return {
    setActivity(a: number) {
      level = Math.max(0, Math.min(1, a));
    },
    next(dtMs = 1000): WristReading {
      t += dtMs;
      const s = t / 1000;
      drift = drift * 0.98 + gauss() * hrSd * 0.06; // slow random walk, mean-reverting
      const rsa = 2.2 * Math.sin(2 * Math.PI * (15 / 60) * s);
      const effort = level * (125 - hrMean);
      const hr = hrMean + drift + rsa + effort + gauss() * 0.8;
      const spo2 = 97.6 - level * 0.8 + gauss() * 0.35;
      const skinTemp = 33.4 + level * 0.6 + gauss() * 0.05;
      steps += level > 0.3 ? Math.round((dtMs / 1000) * (1.6 + rand())) : rand() < 0.02 ? 1 : 0;
      const battery = Math.max(0, 100 - s / 60 / 10);
      return {
        t,
        hr: Math.round(hr),
        spo2: Math.round(Math.min(100, spo2) * 10) / 10,
        skinTemp: Math.round(skinTemp * 10) / 10,
        steps,
        battery: Math.round(battery),
      };
    },
  };
}

/** Parse a Bluetooth Heart Rate Measurement (GATT characteristic 0x2A37) into bpm. */
export function parseHeartRateMeasurement(view: DataView): number {
  const flags = view.getUint8(0);
  return flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1);
}

/** Mean of the readings in a window (for one stored observation per minute). */
export function minuteMean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
