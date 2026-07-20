import type { Result } from '../../shared/types/result.js';
import type { IdempotencyKey } from './idempotency-key.js';
import type { IdempotencyRecord } from './idempotency-record.js';
import type {
  IdempotencyClaimError,
  IdempotencyStoreError,
} from './errors/inbound-event-errors.js';
import type { PlatformEventOrchestrationResult } from '../orchestration/platform-event-orchestration-result.js';

export type IdempotencyStore = {
  claim(params: {
    key: IdempotencyKey;
    normalizedEventId: string;
  }): Promise<Result<IdempotencyRecord, IdempotencyClaimError | IdempotencyStoreError>>;

  findByKey(key: IdempotencyKey): Promise<IdempotencyRecord | null>;

  markCompleted(params: {
    key: IdempotencyKey;
    orchestrationResult: PlatformEventOrchestrationResult;
  }): Promise<Result<IdempotencyRecord, IdempotencyStoreError>>;

  markFailed(params: {
    key: IdempotencyKey;
    failureReason: string;
  }): Promise<Result<IdempotencyRecord, IdempotencyStoreError>>;
};
