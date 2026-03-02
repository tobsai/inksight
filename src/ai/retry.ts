/**
 * AI Provider Retry Utility — Phase 7
 *
 * Exponential backoff with jitter for transient AI API errors.
 * Rate-limit responses (HTTP 429) are respected via Retry-After header.
 */

import { RateLimitError } from '../errors/inksight-error.js';

export interface RetryOptions {
  /** Maximum number of attempts (first attempt + retries). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Default: 500 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30 000 */
  maxDelayMs?: number;
  /** Jitter factor (0–1). Default: 0.3 */
  jitter?: number;
}

/**
 * Determine whether an error from an AI SDK is a transient error worth retrying.
 *
 * Handles:
 *  - HTTP 429 (rate limit / quota)
 *  - HTTP 500/502/503/504 (server errors)
 *  - Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
 */
function isRetryable(err: unknown): boolean {
  if (err == null) return false;

  // RateLimitError — always retry
  if (err instanceof RateLimitError) return true;

  const e = err as Record<string, unknown>;

  // Anthropic / OpenAI SDK surface HTTP status on the error object
  const status = (e['status'] ?? e['statusCode'] ?? e['httpStatus']) as number | undefined;
  if (status != null) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  // Node.js network errors
  const code = e['code'] as string | undefined;
  if (code != null) {
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE'].includes(code);
  }

  // Fallback: error message heuristics
  const msg = (e['message'] as string | undefined) ?? '';
  return /rate.?limit|too.?many.?requests|service.?unavailable|internal.?server/i.test(msg);
}

/**
 * Extract the Retry-After delay (ms) from an error, if present.
 * Anthropic/OpenAI SDKs expose this as `error.headers['retry-after']`.
 */
function extractRetryAfterMs(err: unknown): number | undefined {
  if (err == null) return undefined;
  const e = err as Record<string, unknown>;
  const headers = e['headers'] as Record<string, string> | undefined;
  if (headers == null) return undefined;

  const raw = headers['retry-after'];
  if (!raw) return undefined;

  const seconds = parseFloat(raw);
  if (!isNaN(seconds)) return Math.ceil(seconds * 1000);
  return undefined;
}

/**
 * Execute `fn` with exponential-backoff retry on transient failures.
 *
 * @example
 * const result = await withRetry(() => this.client.messages.create(...), { maxAttempts: 3 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitter = options.jitter ?? 0.3;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // If not the last attempt and error is retryable, wait and retry
      if (attempt < maxAttempts && isRetryable(err)) {
        const retryAfter = extractRetryAfterMs(err);
        let delay: number;

        if (retryAfter != null) {
          delay = retryAfter;
        } else {
          // Exponential backoff: baseDelayMs * 2^(attempt-1)
          const base = baseDelayMs * Math.pow(2, attempt - 1);
          // Add ±jitter
          const jitterMs = base * jitter * (Math.random() * 2 - 1);
          delay = Math.min(Math.max(base + jitterMs, 0), maxDelayMs);
        }

        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
