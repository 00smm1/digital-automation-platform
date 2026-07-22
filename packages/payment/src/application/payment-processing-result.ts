import type { ExecutionRunId } from '@dap/core';
import type { InboundProcessingResult } from '@dap/core';
import type { PaymentStatus } from '../domain/payment-status.js';
import type { PaymentDecision } from '../domain/payment-authorization-result.js';

export const PAYMENT_PROCESSING_OUTCOMES = [
  'processed',
  'duplicate',
  'rejected',
  'failed',
  'authorized_not_fulfilled',
  'partial_processing',
] as const;

export type PaymentProcessingOutcome = (typeof PAYMENT_PROCESSING_OUTCOMES)[number];

export type PaymentProcessingResult = {
  readonly outcome: PaymentProcessingOutcome;
  readonly externalEventId: string;
  readonly externalPaymentReference: string;
  readonly externalOrderReference: string;
  readonly paymentSource: string;
  readonly normalizedPaymentStatus: PaymentStatus;
  readonly authorizationDecision: PaymentDecision;
  readonly authorized: boolean;
  readonly fulfillmentExecuted: boolean;
  readonly executionRunId?: ExecutionRunId;
  readonly reasonCode: string;
  readonly reasonMessage: string;
  readonly inboundResult?: InboundProcessingResult;
};

export const createPaymentProcessingResult = (
  params: PaymentProcessingResult,
): PaymentProcessingResult => ({
  outcome: params.outcome,
  externalEventId: params.externalEventId,
  externalPaymentReference: params.externalPaymentReference,
  externalOrderReference: params.externalOrderReference,
  paymentSource: params.paymentSource,
  normalizedPaymentStatus: params.normalizedPaymentStatus,
  authorizationDecision: params.authorizationDecision,
  authorized: params.authorized,
  fulfillmentExecuted: params.fulfillmentExecuted,
  executionRunId: params.executionRunId,
  reasonCode: params.reasonCode,
  reasonMessage: params.reasonMessage,
  inboundResult: params.inboundResult,
});
