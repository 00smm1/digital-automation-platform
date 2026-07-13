/**
 * Base error with stable code and layer metadata.
 */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly layer: 'domain' | 'application' | 'shared';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
