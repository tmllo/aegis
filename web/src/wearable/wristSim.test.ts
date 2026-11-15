import { describe, expect, it } from 'vitest';
import { createWristSim, minuteMean, parseHeartRateMeasurement } from './wristSim';

const run = (sim: ReturnType<typeof createWristSim>, n: number) => Array.from({ length: n }, () => sim.next(1000));

describe('createWristSim', () => {
  it('stays around the member baseline at rest', () => {
    const r = run(createWristSim({ hrMean: 58, hrSd: 4, seed: 3 }), 600);
    const m = r.reduce((a, b) => a + b.hr, 0) / r.length;
    expect(Math.abs(m - 58)).toBeLessThan(4);
    expect(Math.min(...r.map((x) => x.hr))).toBeGreaterThan(40);
    expect(Math.max(...r.map((x) => x.hr))).toBeLessThan(85);
  });

  it('raises heart rate and counts steps during exercise', () => {
    const sim = createWristSim({ hrMean: 60, seed: 5 });
    const rest = run(sim, 120);
    sim.setActivity(1);
    const work = run(sim, 120);
    const avg = (x: typeof rest) => x.reduce((a, b) => a + b.hr, 0) / x.length;
    expect(avg(work) - avg(rest)).toBeGreaterThan(40);
    expect(work[work.length - 1].steps - rest[rest.length - 1].steps).toBeGreaterThan(150);
  });

  it('keeps SpO2 and skin temperature physiological', () => {
    for (const x of run(createWristSim({ seed: 9 }), 300)) {
      expect(x.spo2).toBeGreaterThanOrEqual(95);
      expect(x.spo2).toBeLessThanOrEqual(100);
      expect(x.skinTemp).toBeGreaterThan(32.5);
      expect(x.skinTemp).toBeLessThan(35);
    }
  });

  it('is deterministic for a seed', () => {
    expect(run(createWristSim({ seed: 2 }), 5)).toEqual(run(createWristSim({ seed: 2 }), 5));
  });
});

describe('parseHeartRateMeasurement', () => {
  it('reads 8-bit and 16-bit heart rate values', () => {
    expect(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00, 72]).buffer))).toBe(72);
    expect(parseHeartRateMeasurement(new DataView(new Uint8Array([0x01, 0x2c, 0x01]).buffer))).toBe(300);
  });
});

describe('minuteMean', () => {
  it('averages and handles empty windows', () => {
    expect(minuteMean([60, 62, 64])).toBe(62);
    expect(minuteMean([])).toBeNull();
  });
});
