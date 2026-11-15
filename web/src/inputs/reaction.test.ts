import { describe, expect, it } from 'vitest';
import { againstBaseline, nextWait, score } from './reaction';

describe('PVT scoring', () => {
  it('computes mean, median, lapses and counts anticipations as false starts', () => {
    const r = score([250, 300, 620, 280, 60], 1);
    expect(r.trials).toBe(4);
    expect(r.meanMs).toBe(363);
    expect(r.medianMs).toBe(290);
    expect(r.lapses).toBe(1);
    expect(r.falseStarts).toBe(2);
  });

  it('handles no valid trials', () => {
    expect(score([]).meanMs).toBeNull();
  });

  it('scores against the person own history', () => {
    expect(againstBaseline(300, [290, 300]).usual).toBeNull();
    expect(againstBaseline(305, [290, 300, 310]).status).toBe('green');
    expect(againstBaseline(360, [290, 300, 310]).status).toBe('amber');
    expect(againstBaseline(400, [290, 300, 310]).status).toBe('red');
  });

  it('waits 1.5 to 4 s between dots', () => {
    expect(nextWait(() => 0)).toBe(1500);
    expect(nextWait(() => 1)).toBe(4000);
  });
});
