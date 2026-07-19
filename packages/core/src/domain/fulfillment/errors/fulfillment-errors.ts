import { DomainError } from '../../../shared/errors/domain-error.js';

export class FulfillmentValidationError extends DomainError {
  readonly code = 'FULFILLMENT_VALIDATION';

  constructor(message: string) {
    super(message);
  }
}

export class FulfillmentExecutionError extends DomainError {
  readonly code = 'FULFILLMENT_EXECUTION';

  constructor(message: string) {
    super(message);
  }
}
