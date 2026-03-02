/**
 * Phase 7 — Retry Utility Tests
 *
 * All tests avoid real delays by using baseDelayMs: 0.
 * Fake-timer tests (Retry-After header, jitter) use vi.useFakeTimers()
 * within the specific test that needs them.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { withRetry } from './retry.js';
import { RateLimitError } from '../errors/inksight-error.js';

afterEach(() => {
  // Ensure real timers are always restored after each test
  vi.useRealTimers();
});

// Shorthand: options with zero delay so tests don't actually sleep
const FAST: Parameters<typeof withRetry>[1] = {
  maxAttempts: 3,
  baseDelayMs: 0,
  maxDelayMs: 0,
};

// ──────────────────────────────────────────────────────────────────────────────
// withRetry — success paths
// ──────────────────────────────────────────────────────────────────────────────

describe('withRetry — success', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('hello');
    const result = await withRetry(fn, FAST);
    expect(result).toBe('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on second attempt after one transient failure', async () => {
    const transientErr = Object.assign(new Error('server error'), { status: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds on third attempt after two transient failures', async () => {
    const transientErr = Object.assign(new Error('rate limit'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(transientErr)
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce('final');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('final');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// withRetry — failure paths
// ──────────────────────────────────────────────────────────────────────────────

describe('withRetry — failures', () => {
  it('throws after exhausting all attempts on persistent transient error', async () => {
    const err = Object.assign(new Error('gateway timeout'), { status: 504 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, FAST)).rejects.toThrow('gateway timeout');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-retryable errors (auth, 401)', async () => {
    const authErr = Object.assign(new Error('unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValue(authErr);

    await expect(withRetry(fn, FAST)).rejects.toThrow('unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 400 bad request', async () => {
    const badRequest = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(badRequest);

    await expect(withRetry(fn, FAST)).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on RateLimitError', async () => {
    const rateLimitErr = new RateLimitError('Too Many Requests', 0);
    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ECONNRESET network error', async () => {
    const networkErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const fn = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('reconnected');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('reconnected');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ETIMEDOUT', async () => {
    const timeoutErr = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const fn = vi.fn()
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce('done');

    const result = await withRetry(fn, { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 });
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects Retry-After header from error headers (fake timers)', async () => {
    vi.useFakeTimers();

    const rateLimitWithHeader = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { 'retry-after': '2' }, // 2 seconds
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitWithHeader)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    // Advance 2000ms to clear the Retry-After delay
    await vi.advanceTimersByTimeAsync(2100);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('maxAttempts: 1 never retries', async () => {
    const err = Object.assign(new Error('server error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('server error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// withRetry — edge cases
// ──────────────────────────────────────────────────────────────────────────────

describe('withRetry — edge cases', () => {
  it('retries on 503 service unavailable', async () => {
    const err = Object.assign(new Error('service unavailable'), { status: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('back');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('back');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on message containing "rate limit"', async () => {
    const err = new Error('rate limit exceeded, please slow down');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, FAST);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('handles non-Error thrown values', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    // 'string error' is not retryable (no status, no code)
    await expect(withRetry(fn, FAST)).rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
