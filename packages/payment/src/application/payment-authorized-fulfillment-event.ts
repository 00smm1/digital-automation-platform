import type { PaymentReference } from '../domain/payment-reference.js';
import type { PaymentSource } from '../domain/payment-source.js';
import type { PaymentStatus } from '../domain/payment-status.js';
import type { CommerceOrderRecord } from '../domain/commerce-order-record.js';
import { copyCommerceOrderRecord } from '../domain/commerce-order-record.js';
import { cloneDate, copySafeMetadata, type SafeMetadata } from '../domain/immutability.js';

export type PaymentAuthorizedFulfillmentEvent = {
  readonly paymentReference: PaymentReference;
  readonly externalOrderReference: string;
  readonly paymentSource: PaymentSource;
  readonly paymentStatus: PaymentStatus;
  readonly occurredAt: Date;
  readonly commerceOrder: CommerceOrderRecord;
  readonly metadata: SafeMetadata;
};

export const createPaymentAuthorizedFulfillmentEvent = (
  params: PaymentAuthorizedFulfillmentEvent,
): PaymentAuthorizedFulfillmentEvent => ({
  paymentReference: params.paymentReference,
  externalOrderReference: params.externalOrderReference,
  paymentSource: params.paymentSource,
  paymentStatus: params.paymentStatus,
  occurredAt: cloneDate(params.occurredAt),
  commerceOrder: copyCommerceOrderRecord(params.commerceOrder),
  metadata: copySafeMetadata(params.metadata),
});
