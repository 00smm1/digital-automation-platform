import type { Money } from './money.js';
import type { PaymentReference } from './payment-reference.js';
import type { PaymentSource } from './payment-source.js';
import type { PaymentStatus } from './payment-status.js';
import { cloneDate, copySafeMetadata, type SafeMetadata } from './immutability.js';

export type PaymentConfirmation = {
  readonly paymentReference: PaymentReference;
  readonly externalOrderReference: string;
  readonly paymentSource: PaymentSource;
  readonly status: PaymentStatus;
  readonly occurredAt: Date;
  readonly externalEventId: string;
  readonly money?: Money;
  readonly metadata: SafeMetadata;
};

export const createPaymentConfirmation = (params: PaymentConfirmation): PaymentConfirmation => ({
  paymentReference: params.paymentReference,
  externalOrderReference: params.externalOrderReference,
  paymentSource: params.paymentSource,
  status: params.status,
  occurredAt: cloneDate(params.occurredAt),
  externalEventId: params.externalEventId,
  money: params.money === undefined ? undefined : { ...params.money },
  metadata: copySafeMetadata(params.metadata),
});
