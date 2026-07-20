import { DomainError } from '../../../shared/errors/domain-error.js';
import type { IdempotencyRecord } from '../idempotency-record.js';

export class InboundEventNormalizationError extends DomainError {
  readonly code = 'INBOUND_EVENT_NORMALIZATION';

  constructor(
    message: string,
    readonly failureCode: string = 'NORMALIZATION_FAILED',
  ) {
    super(message);
  }
}

export class IdempotencyClaimError extends DomainError {
  readonly code = 'IDEMPOTENCY_CLAIM';

  readonly existingRecord?: IdempotencyRecord;

  constructor(
    message: string,
    readonly failureCode: string,
    existingRecord?: IdempotencyRecord,
  ) {
    super(message);
    this.existingRecord = existingRecord;
  }
}

export class IdempotencyStoreError extends DomainError {
  readonly code = 'IDEMPOTENCY_STORE';

  constructor(
    message: string,
    readonly failureCode: string = 'STORE_OPERATION_FAILED',
  ) {
    super(message);
  }
}

export class InboundEventGatewayError extends DomainError {
  readonly code = 'INBOUND_EVENT_GATEWAY';

  constructor(
    message: string,
    readonly failureCode: string = 'GATEWAY_PROCESSING_FAILED',
  ) {
    super(message);
  }
}
