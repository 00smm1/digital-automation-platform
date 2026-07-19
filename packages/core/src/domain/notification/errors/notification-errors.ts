import { DomainError } from '../../../shared/errors/domain-error.js';

export class CustomerNotificationError extends DomainError {
  readonly code = 'CUSTOMER_NOTIFICATION';

  constructor(
    message: string,
    readonly failureCode: string = 'NOTIFICATION_FAILED',
  ) {
    super(message);
  }
}
