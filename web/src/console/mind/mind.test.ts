import { describe, expect, it } from 'vitest';
import { answer, passesGuard, topicOf } from './advisor';
import { assess, routeText, type Wellbeing } from './rules';

const week = (scores: Wellbeing['weeks'][number]['scores']) => ({ from: '2026-11-08', to: '2026-11-14', scores, checkin_days: 7 });

describe('assess', () => {
  it('is steady with no alerts, no drops and a calm day', () => {
    const r = assess({ weeks: [week({ 'self.sleep_h': { mean: 6.9, n: 7 } })], trend: {} }, { 'self.mood': 4, 'self.stress': 2 });
    expect(r).toEqual({ status: 'green', word: 'Steady', reasons: [], route: 'self-care' });
  });

  it('is strained on a week-on-week mood drop or short sleep, routed to the private conference', () => {
    const r = assess({ weeks: [week({ 'self.sleep_h': { mean: 5.9, n: 7 } })], trend: { 'self.mood': { first: 4, last: 3.4, change: -0.6 } } });
    expect(r.status).toBe('amber');
    expect(r.word).toBe('Strained');
    expect(r.route).toBe('private-conference');
    expect(r.reasons.join(' ')).toMatch(/Mood down 0.6/);
    expect(r.reasons.join(' ')).toMatch(/Sleep 5.9 h/);
  });

  it('takes the server alerts (scored against her own baseline)', () => {
    const r = assess({ weeks: [], trend: {}, alerts: [{ metric: 'self.sleep_h', t: '2026-11-11', severity: 'amber', message: '' }] });
    expect(r.status).toBe('amber');
  });

  it('reaches out to the crew medical officer at the ends of the scale', () => {
    expect(assess(null, { 'self.mood': 1 }).route).toBe('crew-medical-officer');
    expect(assess(null, { 'self.stress': 5 }).status).toBe('red');
    expect(assess({ weeks: [], trend: {}, alerts: [{ metric: 'self.mood', t: '2026-11-14', severity: 'red', message: '' }] }, {}).word).toBe('Reach out');
  });

  it('ignores alerts for non-mind metrics', () => {
    expect(assess({ weeks: [], trend: {}, alerts: [{ metric: 'vital.bp_sys', t: '2026-11-14', severity: 'red', message: '' }] }).status).toBe('green');
  });
});

describe('advisor', () => {
  const amber = assess(null, { 'self.stress': 4 });
  const red = assess(null, { 'self.mood': 1 });

  it('finds the topic', () => {
    expect(topicOf("I can't sleep")).toBe('sleep');
    expect(topicOf('I miss my family')).toBe('lonely');
    expect(topicOf('who can I talk to')).toBe('talk');
    expect(topicOf('what is the weather')).toBe('other');
  });

  it('never changes the level or route the rules set, and adds the route when not green', () => {
    for (const read of [amber, red]) {
      const a = answer('I feel stressed', read, '4-24 min');
      expect(a.status).toBe(read.status);
      expect(a.route).toBe(read.route);
      expect(a.text).toContain(routeText(read.route, '4-24 min'));
    }
  });

  it('prepared answers pass the guardrail', () => {
    for (const q of ["I can't sleep", 'stress', 'lonely', 'sad', 'tired', 'talk to someone', 'busy schedule', 'hello']) {
      expect(passesGuard(answer(q, red, 'seconds').text)).toBe(true);
    }
  });

  it('guardrail blocks medication, doses and diagnoses', () => {
    expect(passesGuard('Take 5 mg of melatonin')).toBe(false);
    expect(passesGuard('You have depression.')).toBe(false);
    expect(passesGuard('Try paced breathing for four minutes.')).toBe(true);
  });
});
