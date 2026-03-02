/**
 * Phase 7 — Parallel Processor Tests
 *
 * Tests for the ParallelProcessor concurrency-limited task runner.
 * No I/O, no mocks needed — pure in-process logic.
 */

import { describe, expect, it, vi } from 'vitest';
import { ParallelProcessor } from './parallel-processor.js';

// ──────────────────────────────────────────────────────────────────────────────
// ParallelProcessor — basic functionality
// ──────────────────────────────────────────────────────────────────────────────

describe('ParallelProcessor — basic', () => {
  it('processes all items and returns results in order', async () => {
    const processor = new ParallelProcessor<number, number>(
      async (n) => n * 2,
      { concurrency: 2 }
    );

    const results = await processor.processAll([1, 2, 3, 4, 5]);

    expect(results).toHaveLength(5);
    expect(results.map(r => r.output)).toEqual([2, 4, 6, 8, 10]);
    expect(results.every(r => r.error === undefined)).toBe(true);
  });

  it('handles empty input without error', async () => {
    const processor = new ParallelProcessor<number, number>(
      async (n) => n,
      { concurrency: 4 }
    );

    const results = await processor.processAll([]);
    expect(results).toHaveLength(0);
  });

  it('processes a single item', async () => {
    const processor = new ParallelProcessor<string, string>(
      async (s) => s.toUpperCase(),
      { concurrency: 4 }
    );

    const results = await processor.processAll(['hello']);
    expect(results[0].output).toBe('HELLO');
    expect(results[0].error).toBeUndefined();
  });

  it('captures errors without stopping other tasks', async () => {
    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        if (n === 2) throw new Error('bad item 2');
        return n * 10;
      },
      { concurrency: 4 }
    );

    const results = await processor.processAll([1, 2, 3]);

    expect(results[0].output).toBe(10);
    expect(results[1].error?.message).toBe('bad item 2');
    expect(results[2].output).toBe(30);
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 5));
        concurrent--;
        return n;
      },
      { concurrency: 3 }
    );

    await processor.processAll([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThanOrEqual(1);
  });

  it('concurrency of 1 processes items sequentially', async () => {
    const order: number[] = [];

    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        order.push(n);
        return n;
      },
      { concurrency: 1 }
    );

    await processor.processAll([3, 1, 2]);

    // With concurrency=1, order must match input order
    expect(order).toEqual([3, 1, 2]);
  });

  it('preserves result order regardless of task completion order', async () => {
    // Tasks with longer delays for lower indices complete later
    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        const delay = (4 - n) * 5; // n=0 waits 20ms, n=3 waits 5ms
        await new Promise(r => setTimeout(r, delay));
        return n * 100;
      },
      { concurrency: 4 }
    );

    const results = await processor.processAll([0, 1, 2, 3]);

    // Despite different completion order, results array must be in input order
    expect(results.map(r => r.output)).toEqual([0, 100, 200, 300]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ParallelProcessor — retry support
// ──────────────────────────────────────────────────────────────────────────────

describe('ParallelProcessor — retry', () => {
  it('retries failed tasks up to the configured retry count', async () => {
    const callCounts = new Map<number, number>();

    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        const count = (callCounts.get(n) ?? 0) + 1;
        callCounts.set(n, count);
        if (count < 3) throw new Error('not yet');
        return n;
      },
      { concurrency: 2, retries: 3 }
    );

    const results = await processor.processAll([1]);

    expect(results[0].output).toBe(1);
    expect(callCounts.get(1)).toBe(3);
  });

  it('captures error after exhausting retries', async () => {
    const processor = new ParallelProcessor<number, number>(
      async () => { throw new Error('always fails'); },
      { concurrency: 2, retries: 2 }
    );

    const results = await processor.processAll([42]);

    expect(results[0].output).toBeUndefined();
    expect(results[0].error?.message).toBe('always fails');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ParallelProcessor — timeout support
// ──────────────────────────────────────────────────────────────────────────────

describe('ParallelProcessor — timeout', () => {
  it('captures timeout error when task exceeds timeoutMs', async () => {
    const processor = new ParallelProcessor<number, number>(
      async () => new Promise(r => setTimeout(r, 500)), // takes 500ms
      { concurrency: 2, timeoutMs: 20 }
    );

    const results = await processor.processAll([1]);

    expect(results[0].error?.message).toMatch(/timed out/i);
  });

  it('does not time out tasks that complete within limit', async () => {
    const processor = new ParallelProcessor<number, number>(
      async (n) => {
        await new Promise(r => setTimeout(r, 5));
        return n;
      },
      { concurrency: 2, timeoutMs: 200 }
    );

    const results = await processor.processAll([1, 2, 3]);
    expect(results.every(r => r.output !== undefined)).toBe(true);
  });
});
