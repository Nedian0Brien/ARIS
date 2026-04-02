import { describe, expect, it } from 'vitest';
import { ScopeQueue } from '../src/runtime/scopeQueue.js';

describe('ScopeQueue', () => {
  it('runs a single task and returns its result', async () => {
    const q = new ScopeQueue();
    const result = await q.run('key-a', async () => 42);
    expect(result).toBe(42);
  });

  it('serializes concurrent tasks for the same key', async () => {
    const q = new ScopeQueue();
    const order: number[] = [];

    const t1 = q.run('key-a', async () => {
      await new Promise((res) => setTimeout(res, 20));
      order.push(1);
    });
    const t2 = q.run('key-a', async () => {
      order.push(2);
    });

    await Promise.all([t1, t2]);
    expect(order).toEqual([1, 2]);
  });

  it('runs tasks for different keys concurrently', async () => {
    const q = new ScopeQueue();
    const started: string[] = [];

    const t1 = q.run('key-a', async () => {
      started.push('a');
      await new Promise((res) => setTimeout(res, 20));
    });
    const t2 = q.run('key-b', async () => {
      started.push('b');
    });

    await t2; // key-b should not wait for key-a
    expect(started).toContain('b');
    await t1;
  });

  it('isQueued returns true while a task is running', async () => {
    const q = new ScopeQueue();

    const task = q.run('key-a', async () => {
      await new Promise((res) => setTimeout(res, 20));
    });

    await new Promise((res) => setTimeout(res, 5));
    expect(q.isQueued('key-a')).toBe(true);
    await task;
    expect(q.isQueued('key-a')).toBe(false);
  });

  it('cleans up key after task completes', async () => {
    const q = new ScopeQueue();
    await q.run('key-a', async () => {});
    expect(q.isQueued('key-a')).toBe(false);
  });

  it('propagates errors without blocking subsequent tasks', async () => {
    const q = new ScopeQueue();
    const results: string[] = [];

    await expect(
      q.run('key-a', async () => {
        throw new Error('oops');
      }),
    ).rejects.toThrow('oops');

    await q.run('key-a', async () => {
      results.push('after error');
    });
    expect(results).toContain('after error');
  });
});
