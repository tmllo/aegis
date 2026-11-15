import { describe, expect, it } from 'vitest';
import { swapTaskId, type Pending, type Task, type TaskEvent } from './mind';

describe('swapTaskId', () => {
  it('replaces a local task id with the server id in tasks, events and queued event paths', () => {
    const task: Task = { id: 'abc123', subject: 'c1', kind: 'todo', label: 'Stretch', origin: 'self', created: '2026-11-14T10:00:00Z' };
    const events: TaskEvent[] = [{ task_id: 'abc123', date: '2026-11-14', status: 'done' }];
    const queue: Pending[] = [
      { path: 'api/tasks/abc123/events', body: { subject: 'c1', status: 'done' } },
      { path: 'api/observations', body: { subject: 'c1', metric: 'self.mood', value: 4 } },
    ];
    const out = swapTaskId({ tasks: [task], events, queue }, 'abc123', 'self-c1-07b665fe');
    expect(out.tasks[0].id).toBe('self-c1-07b665fe');
    expect(out.events[0].task_id).toBe('self-c1-07b665fe');
    expect(out.queue[0].path).toBe('api/tasks/self-c1-07b665fe/events');
    expect(out.queue[1].path).toBe('api/observations');
  });

  it('leaves the state alone when the ids are equal', () => {
    const s = { tasks: [], events: [], queue: [] };
    expect(swapTaskId(s, 'a', 'a')).toBe(s);
  });
});
