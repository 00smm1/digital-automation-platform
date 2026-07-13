import { BaseError } from './base-error.js';

/**
 * Error raised when application orchestration fails.
 */
export abstract class ApplicationError extends BaseError {
  readonly layer = 'application' as const;
}
