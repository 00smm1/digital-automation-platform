import type { PaymentConfirmation } from './payment-confirmation.js';
import type { PaymentReference } from './payment-reference.js';
import type { PaymentSource } from './payment-source.js';
import type { PaymentStatus } from './payment-status.js';
import type { Money } from './money.js';
import { cloneDate } from './immutability.js';

export type PaymentRecord = {
  readonly paymentReference: PaymentReference;
  readonly externalOrderReference: string;
  readonly paymentSource: PaymentSource;
  readonly status: PaymentStatus;
  readonly occurredAt: Date;
  readonly externalEventId: string;
  readonly money?: Money;
  readonly confirmedAt?: Date;
  readonly processedAt?: Date;
};

export const createPaymentRecordFromConfirmation = (
  confirmation: PaymentConfirmation,
  params: { readonly confirmedAt?: Date; readonly processedAt?: Date } = {},
): PaymentRecord => ({
  paymentReference: confirmation.paymentReference,
  externalOrderReference: confirmation.externalOrderReference,
  paymentSource: confirmation.paymentSource,
  status: confirmation.status,
  occurredAt: cloneDate(confirmation.occurredAt),
  externalEventId: confirmation.externalEventId,
  money: confirmation.money === undefined ? undefined : { ...confirmation.money },
  confirmedAt: params.confirmedAt === undefined ? undefined : cloneDate(params.confirmedAt),
  processedAt: params.processedAt === undefined ? undefined : cloneDate(params.processedAt),
});

export const copyPaymentRecord = (record: PaymentRecord): PaymentRecord => ({
  paymentReference: record.paymentReference,
  externalOrderReference: record.externalOrderReference,
  paymentSource: record.paymentSource,
  status: record.status,
  occurredAt: cloneDate(record.occurredAt),
  externalEventId: record.externalEventId,
  money: record.money === undefined ? undefined : { ...record.money },
  confirmedAt: record.confirmedAt === undefined ? undefined : cloneDate(record.confirmedAt),
  processedAt: record.processedAt === undefined ? undefined : cloneDate(record.processedAt),
});
