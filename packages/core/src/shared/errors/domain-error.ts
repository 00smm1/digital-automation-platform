import { BaseError } from './base-error.js';

/**
 * Error raised when domain invariants are violated.
 */
export abstract class DomainError extends BaseError {
  readonly layer = 'domain' as const;
}
