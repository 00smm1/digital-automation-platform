import { DomainError } from '../../../shared/errors/domain-error.js';

export class OrderFulfillmentAuthorizationError extends DomainError {
  readonly code = 'ORDER_FULFILLMENT_AUTHORIZATION';

  constructor(
    message: string,
    readonly failureCode: string,
  ) {
    super(message);
  }
}
