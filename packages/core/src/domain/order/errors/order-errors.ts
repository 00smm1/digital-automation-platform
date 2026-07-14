import { DomainError } from '../../../shared/errors/domain-error.js';
import { ApplicationError } from '../../../shared/errors/application-error.js';
import type { OrderId } from '../order.js';
import type { OrderStatus } from '../order-status.js';

export class OrderValidationError extends ApplicationError {
  readonly code = 'ORDER_VALIDATION_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class InvalidOrderTransitionError extends DomainError {
  readonly code = 'INVALID_ORDER_TRANSITION';

  constructor(
    readonly orderId: OrderId,
    readonly currentStatus: OrderStatus,
    readonly targetStatus: OrderStatus,
    options?: ErrorOptions,
  ) {
    super(
      `Cannot transition order "${orderId}" from "${currentStatus}" to "${targetStatus}".`,
      options,
    );
  }
}

export class OrderProcessingError extends ApplicationError {
  readonly code = 'ORDER_PROCESSING_FAILED';

  constructor(
    message: string,
    readonly orderId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class OrderProviderNotFoundError extends ApplicationError {
  readonly code = 'ORDER_PROVIDER_NOT_FOUND';

  constructor(
    readonly providerId: string,
    readonly orderId?: string,
  ) {
    super(`Provider "${providerId}" is not registered.`);
  }
}

export class OrderProviderCapabilityError extends ApplicationError {
  readonly code = 'ORDER_PROVIDER_CAPABILITY_UNSUPPORTED';

  constructor(
    readonly providerId: string,
    readonly capability: string,
    readonly orderId?: string,
  ) {
    super(`Provider "${providerId}" does not support capability "${capability}".`);
  }
}

export class OrderPipelineNotFoundError extends ApplicationError {
  readonly code = 'ORDER_PIPELINE_NOT_FOUND';

  constructor(
    readonly pipelineId: string,
    readonly orderId?: string,
  ) {
    super(`Automation pipeline "${pipelineId}" was not supplied in the request.`);
  }
}
