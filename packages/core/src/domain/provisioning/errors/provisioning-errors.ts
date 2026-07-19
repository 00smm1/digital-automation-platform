import { DomainError } from '../../../shared/errors/domain-error.js';

export class DigitalProductProvisioningError extends DomainError {
  readonly code = 'DIGITAL_PRODUCT_PROVISIONING';

  constructor(
    message: string,
    readonly failureCode: string = 'PROVISIONING_FAILED',
  ) {
    super(message);
  }
}
