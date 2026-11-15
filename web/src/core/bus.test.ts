import { describe, expect, it } from 'vitest';
import { createBus } from './bus';
import { danglingEdges, LINEAGE } from './lineage';
import { toFhir } from './observation';

type Ev = { a: { n: number }; b: string };

describe('bus', () => {
  it('delivers typed events in order and keeps a capped history', () => {
    const bus = createBus<Ev>({ capacity: 3, now: () => 1 });
    const seen: number[] = [];
    const all: string[] = [];
    const off = bus.on('a', (r) => seen.push(r.payload.n));
    bus.onAny((r) => all.push(String(r.type)));
    for (let n = 1; n <= 4; n++) bus.emit('a', { n });
    bus.emit('b', 'x');
    off();
    bus.emit('a', { n: 9 });
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(all).toEqual(['a', 'a', 'a', 'a', 'b', 'a']);
    expect(bus.getSnapshot().map((r) => r.seq)).toEqual([4, 5, 6]);
    expect(bus.count('a')).toBe(5);
    expect(bus.count()).toBe(6);
  });

  it('notifies subscribers with a new snapshot identity per emit', () => {
    const bus = createBus<Ev>();
    let calls = 0;
    bus.subscribe(() => calls++);
    const before = bus.getSnapshot();
    bus.emit('b', 'x');
    expect(calls).toBe(1);
    expect(bus.getSnapshot()).not.toBe(before);
    expect(bus.getSnapshot()).toBe(bus.getSnapshot());
  });
});

describe('observation and lineage', () => {
  it('maps an Observation to a FHIR-shaped resource', () => {
    const f = toFhir({ subject: 'c1', metric: 'hr', value: 61, unit: 'bpm', time: '2026-09-01', source: 'replay' });
    expect(f.valueQuantity).toEqual({ value: 61, unit: 'bpm' });
    expect(f.subject.reference).toBe('Patient/c1');
    expect(toFhir({ subject: 'c1', metric: 'hr', value: null, unit: 'bpm', time: 't', source: 's' }).valueQuantity).toBeUndefined();
  });

  it('lineage graph has no dangling edges', () => {
    expect(danglingEdges(LINEAGE)).toEqual([]);
  });
});
