/**
 * InkSight Typed Error Hierarchy — Phase 7.2
 *
 * Structured error classes with machine-readable codes and optional context.
 */

export class InkSightError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InkSightError';
    // Maintain proper prototype chain for instanceof checks in transpiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConnectionError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', context);
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', context);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TransformError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TRANSFORM_ERROR', context);
    this.name = 'TransformError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StorageError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', context);
    this.name = 'StorageError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigurationError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RateLimitError extends InkSightError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT', context);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends InkSightError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', context);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
