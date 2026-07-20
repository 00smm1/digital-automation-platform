import { Result } from '../../shared/types/result.js';
import type { IdempotencyKey } from './idempotency-key.js';
import { createIdempotencyRecord, type IdempotencyRecord } from './idempotency-record.js';
import type { IdempotencyStore } from './idempotency-store.js';
import { IdempotencyClaimError, IdempotencyStoreError } from './errors/inbound-event-errors.js';
import type { PlatformEventOrchestrationResult } from '../orchestration/platform-event-orchestration-result.js';

/**
 * In-memory idempotency store with deterministic atomic claim simulation.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();
  private configuredClaimError?: IdempotencyStoreError;

  configureClaimFailure(error: IdempotencyStoreError): void {
    this.configuredClaimError = error;
  }

  reset(): void {
    this.records.clear();
    this.configuredClaimError = undefined;
  }

  getAllRecords(): readonly IdempotencyRecord[] {
    return [...this.records.values()];
  }

  async claim(params: {
    key: IdempotencyKey;
    normalizedEventId: string;
  }): Promise<Result<IdempotencyRecord, IdempotencyClaimError | IdempotencyStoreError>> {
    if (this.configuredClaimError !== undefined) {
      return Result.fail(this.configuredClaimError);
    }

    const existing = this.records.get(params.key);

    if (existing !== undefined) {
      return Result.fail(
        new IdempotencyClaimError(
          `Idempotency key "${params.key}" is already ${existing.state}.`,
          `ALREADY_${existing.state.toUpperCase()}`,
          existing,
        ),
      );
    }

    const record = createIdempotencyRecord({
      key: params.key,
      state: 'processing',
      normalizedEventId: params.normalizedEventId,
      claimedAt: new Date(),
    });

    this.records.set(params.key, record);

    return Result.ok(record);
  }

  async findByKey(key: IdempotencyKey): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async markCompleted(params: {
    key: IdempotencyKey;
    orchestrationResult: PlatformEventOrchestrationResult;
  }): Promise<Result<IdempotencyRecord, IdempotencyStoreError>> {
    const existing = this.records.get(params.key);

    if (existing === undefined) {
      return Result.fail(
        new IdempotencyStoreError(
          `Idempotency record "${params.key}" was not found.`,
          'RECORD_NOT_FOUND',
        ),
      );
    }

    const updated = createIdempotencyRecord({
      ...existing,
      state: 'completed',
      completedAt: new Date(),
      orchestrationStatus: params.orchestrationResult.overallStatus,
    });

    this.records.set(params.key, updated);

    return Result.ok(updated);
  }

  async markFailed(params: {
    key: IdempotencyKey;
    failureReason: string;
  }): Promise<Result<IdempotencyRecord, IdempotencyStoreError>> {
    const existing = this.records.get(params.key);

    if (existing === undefined) {
      return Result.fail(
        new IdempotencyStoreError(
          `Idempotency record "${params.key}" was not found.`,
          'RECORD_NOT_FOUND',
        ),
      );
    }

    const updated = createIdempotencyRecord({
      ...existing,
      state: 'failed',
      completedAt: new Date(),
      failureReason: params.failureReason,
    });

    this.records.set(params.key, updated);

    return Result.ok(updated);
  }
}
