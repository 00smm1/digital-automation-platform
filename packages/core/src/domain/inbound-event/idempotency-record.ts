import type { PlatformEventOrchestrationStatus } from '../orchestration/platform-event-orchestration-result.js';
import type { IdempotencyKey } from './idempotency-key.js';

export const IDEMPOTENCY_STATES = ['processing', 'completed', 'failed'] as const;

export type IdempotencyState = (typeof IDEMPOTENCY_STATES)[number];

export type IdempotencyRecord = {
  readonly key: IdempotencyKey;
  readonly state: IdempotencyState;
  readonly normalizedEventId: string;
  readonly claimedAt: Date;
  readonly completedAt?: Date;
  readonly failureReason?: string;
  readonly orchestrationStatus?: PlatformEventOrchestrationStatus;
};

export const createIdempotencyRecord = (params: IdempotencyRecord): IdempotencyRecord => params;
