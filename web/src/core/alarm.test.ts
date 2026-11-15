import { describe, expect, it } from 'vitest';
import { alarmActive, alarmClass, FORECAST_PHASES, type AlarmPhase } from './alarm';

// Locks the safety rule in docs/ARCHITECTURE.md: a forecast never raises Emergency.
describe('radiation alarm class', () => {
  it('a model forecast raises Warning, never Emergency', () => {
    for (const phase of FORECAST_PHASES) {
      expect(alarmClass(phase)).toBe('warning');
      expect(alarmClass(phase)).not.toBe('emergency');
    }
  });

  it('measured particle arrival raises Emergency', () => {
    expect(alarmClass('arrived')).toBe('emergency');
  });

  it('no alarm raises nothing', () => {
    expect(alarmClass('off')).toBeNull();
    expect(alarmActive('off')).toBe(false);
  });

  it('the crew stays in shelter through forecast and arrival', () => {
    const phases: AlarmPhase[] = ['warning', 'sheltered', 'arrived'];
    for (const p of phases) expect(alarmActive(p)).toBe(true);
  });
});
