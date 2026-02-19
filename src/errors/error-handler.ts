/**
 * InkSight Error Handler — Phase 7.2
 *
 * Converts thrown values to user-friendly messages,
 * determines retryability, and wraps async functions
 * with structured error handling.
 */

import {
  InkSightError,
  ConnectionError,
  AuthenticationError,
  RateLimitError,
  ConfigurationError,
  NotFoundError,
} from './inksight-error.js';

export { InkSightError } from './inksight-error.js';

export class ErrorHandler {
  /**
   * Convert any thrown value to a friendly user-facing message.
   */
  static toUserMessage(err: unknown): string {
    if (err instanceof ConnectionError) {
      return 'Could not connect. Check your network and settings.';
    }
    if (err instanceof AuthenticationError) {
      return 'Authentication failed. Run `inksight config set` to update credentials.';
    }
    if (err instanceof RateLimitError) {
      if (err.retryAfterMs != null) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
        return `Rate limit hit. Retry in ${seconds}s.`;
      }
      return 'Rate limit hit. Please wait before retrying.';
    }
    if (err instanceof InkSightError) {
      return `${err.message} (${err.code})`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'An unexpected error occurred.';
  }

  /**
   * Returns true if the error is transient and worth retrying.
   */
  static isRetryable(err: unknown): boolean {
    if (err instanceof ConnectionError) return true;
    if (err instanceof RateLimitError) return true;
    if (err instanceof AuthenticationError) return false;
    if (err instanceof ConfigurationError) return false;
    if (err instanceof NotFoundError) return false;
    return false;
  }

  /**
   * Wrap an async function with structured error handling.
   * Never throws — failures are returned as { error }.
   */
  static async wrap<T>(
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<{ data?: T; error?: InkSightError }> {
    try {
      const data = await fn();
      return { data };
    } catch (err) {
      if (err instanceof InkSightError) {
        // Attach additional context if provided
        if (context && !err.context) {
          const wrapped = Object.assign(Object.create(Object.getPrototypeOf(err)), err, {
            context,
          });
          return { error: wrapped as InkSightError };
        }
        return { error: err };
      }
      // Wrap generic errors in InkSightError
      const wrapped = new InkSightError(
        err instanceof Error ? err.message : String(err),
        'UNKNOWN_ERROR',
        context
      );
      return { error: wrapped };
    }
  }
}
