import { describe, expect, it } from 'vitest';
import { detrend, dominantRate, estimate, HEART_BAND, pos, quality, resample, type Sample } from './signal';

const FS = 30;

/** Seeded noise so tests are deterministic. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/** Synthetic face: skin-tone RGB, a small pulse mostly in green, slow light drift, breathing, noise, camera jitter. */
function face({ bpm = 72, breath = 15, seconds = 25, noise = 0.3, drift = 3, jitterMs = 4, seed = 1 } = {}): Sample[] {
  const rand = rng(seed);
  const out: Sample[] = [];
  let t = 0;
  while (t < seconds * 1000) {
    const s = t / 1000;
    const pulse = Math.sin(2 * Math.PI * (bpm / 60) * s);
    const resp = Math.sin(2 * Math.PI * (breath / 60) * s);
    const light = drift * Math.sin(2 * Math.PI * 0.03 * s);
    out.push({
      t,
      r: 150 + light + 0.25 * pulse + 0.8 * resp + noise * rand(),
      g: 110 + light + 0.6 * pulse + 0.8 * resp + noise * rand(),
      b: 90 + light + 0.15 * pulse + 0.8 * resp + noise * rand(),
    });
    t += 1000 / FS + jitterMs * rand();
  }
  return out;
}

describe('resample', () => {
  it('produces a fixed-rate series over the same time span', () => {
    const s = face({ seconds: 10 });
    const r = resample(s, FS);
    expect(Math.abs(r.length - 10 * FS)).toBeLessThanOrEqual(2);
  });
});

describe('dominantRate', () => {
  it('finds a pure sinusoid', () => {
    const x = Array.from({ length: 20 * FS }, (_, i) => Math.sin((2 * Math.PI * 1.25 * i) / FS));
    const r = dominantRate(x, FS, HEART_BAND)!;
    expect(r.rate).toBeCloseTo(75, 0);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('gives low confidence for white noise', () => {
    const rand = rng(7);
    const x = Array.from({ length: 20 * FS }, () => rand());
    expect(dominantRate(x, FS, HEART_BAND)!.confidence).toBeLessThan(0.35);
  });
});

describe('pos + detrend', () => {
  it('recovers the pulse from RGB with drift', () => {
    const rgb = resample(face({ bpm: 66 }), FS);
    const r = dominantRate(detrend(pos(rgb, FS), FS), FS, HEART_BAND)!;
    expect(Math.abs(r.rate - 66)).toBeLessThanOrEqual(2);
  });
});

describe('estimate', () => {
  for (const bpm of [52, 72, 96, 130]) {
    it(`heart rate ${bpm} bpm within 3 bpm`, () => {
      const r = estimate(face({ bpm, seed: bpm }));
      expect(r.bpm).not.toBeNull();
      expect(Math.abs(r.bpm! - bpm)).toBeLessThanOrEqual(3);
      expect(r.confidence).toBeGreaterThan(0.4);
    });
  }

  it('breathing rate from a 30 s scan within 3 per minute', () => {
    const r = estimate(face({ bpm: 70, breath: 14, seconds: 30, seed: 3 }));
    expect(r.breathing).not.toBeNull();
    expect(Math.abs(r.breathing! - 14)).toBeLessThanOrEqual(3);
  });

  it('returns nothing for too-short scans', () => {
    expect(estimate(face({ seconds: 3 })).bpm).toBeNull();
  });

  it('drops confidence when the face moves', () => {
    const still = estimate(face({ seed: 11 }));
    const moving = face({ seed: 11 }).map((s, i) => (i % 9 === 0 ? { ...s, r: s.r + 25, g: s.g + 25 } : s));
    expect(estimate(moving).confidence).toBeLessThan(still.confidence);
  });
});

describe('quality', () => {
  it('flags darkness', () => {
    const dark = face().map((s) => ({ ...s, r: 15, g: 12, b: 10 }));
    expect(quality(dark).light).toBeLessThan(0.1);
  });
});
