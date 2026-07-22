import type { IdempotencyKey } from './idempotency-key.js';
import type { IdempotencyState } from './idempotency-record.js';
import type { PlatformEventOrchestrationResult } from '../orchestration/platform-event-orchestration-result.js';
import type { ExecutionRunId } from '../execution-run/execution-run-id.js';
import type { ExecutionRunStatus } from '../execution-run/execution-run-status.js';

export const INBOUND_PROCESSING_STATUSES = [
  'processed',
  'duplicate',
  'rejected',
  'failed',
  'claimFailed',
  'partialProcessing',
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
  readonly executionRunId?: ExecutionRunId;
  readonly executionRunStatus?: ExecutionRunStatus;
  readonly orchestrationResult?: PlatformEventOrchestrationResult;
  readonly failureReason?: string;
  readonly failureCode?: string;
};

export const createInboundProcessingResult = (
  params: InboundProcessingResult,
): InboundProcessingResult => params;
