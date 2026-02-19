/**
 * InkSight Errors — Phase 7.2
 *
 * Barrel export for typed error hierarchy and error handler.
 */

export {
  InkSightError,
  ConnectionError,
  AuthenticationError,
  TransformError,
  StorageError,
  ConfigurationError,
  RateLimitError,
  NotFoundError,
} from './inksight-error.js';

export { ErrorHandler } from './error-handler.js';
