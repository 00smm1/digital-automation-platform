import type { CommerceOrderRecord } from './commerce-order-record.js';
import { copyCommerceOrderRecord } from './commerce-order-record.js';

export const PAYMENT_DECISIONS = ['authorized', 'rejected', 'duplicate', 'conflict'] as const;

export type PaymentDecision = (typeof PAYMENT_DECISIONS)[number];

export type PaymentAuthorizationResult = {
  readonly decision: PaymentDecision;
  readonly authorized: boolean;
  readonly reasonCode: string;
  readonly reasonMessage: string;
};

export const createPaymentAuthorizationResult = (
  params: PaymentAuthorizationResult,
): PaymentAuthorizationResult => ({
  decision: params.decision,
  authorized: params.authorized,
  reasonCode: params.reasonCode,
  reasonMessage: params.reasonMessage,
});

export type PaymentCorrelationResult = {
  readonly commerceOrder: CommerceOrderRecord;
};

export const createPaymentCorrelationResult = (
  commerceOrder: CommerceOrderRecord,
): PaymentCorrelationResult => ({
  commerceOrder: copyCommerceOrderRecord(commerceOrder),
});
