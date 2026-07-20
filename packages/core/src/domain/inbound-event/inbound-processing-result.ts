import type { IdempotencyKey } from './idempotency-key.js';
import type { IdempotencyState } from './idempotency-record.js';
import type { PlatformEventOrchestrationResult } from '../orchestration/platform-event-orchestration-result.js';

export const INBOUND_PROCESSING_STATUSES = [
  'processed',
  'duplicate',
  'rejected',
  'failed',
  'claimFailed',
] as const;

export type InboundProcessingStatus = (typeof INBOUND_PROCESSING_STATUSES)[number];

/**
 * Structured result of processing one external event through the inbound gateway.
 */
export type InboundProcessingResult = {
  readonly status: InboundProcessingStatus;
  readonly sourceId: string;
  readonly externalEventId: string;
  readonly idempotencyKey?: IdempotencyKey;
  readonly normalizedEventId?: string;
  readonly idempotencyState?: IdempotencyState;
  readonly orchestrationResult?: PlatformEventOrchestrationResult;
  readonly failureReason?: string;
  readonly failureCode?: string;
};

export const createInboundProcessingResult = (
  params: InboundProcessingResult,
): InboundProcessingResult => params;
