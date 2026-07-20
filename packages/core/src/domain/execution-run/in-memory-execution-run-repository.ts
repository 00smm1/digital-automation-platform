import { Result } from '../../shared/types/result.js';
import { createExecutionRun, type ExecutionRun } from './execution-run.js';
import type { ExecutionRunId } from './execution-run-id.js';
import type { ExecutionRunRepository } from './execution-run-repository.js';
import type { IdempotencyKey } from '../inbound-event/idempotency-key.js';
import {
  ExecutionRunDuplicateError,
  ExecutionRunNotFoundError,
  ExecutionRunRepositoryError,
} from './errors/execution-run-errors.js';

const cloneExecutionRun = (run: ExecutionRun): ExecutionRun => createExecutionRun(run);

/**
 * In-memory execution run repository with deterministic duplicate protection.
 */
export class InMemoryExecutionRunRepository implements ExecutionRunRepository {
  private readonly runsById = new Map<string, ExecutionRun>();
  private readonly runIdByIdempotencyKey = new Map<string, ExecutionRunId>();
  private configuredSaveError?: ExecutionRunRepositoryError;
  private configuredCreateError?: ExecutionRunRepositoryError;

  configureSaveFailure(error: ExecutionRunRepositoryError): void {
    this.configuredSaveError = error;
  }

  configureCreateFailure(error: ExecutionRunRepositoryError): void {
    this.configuredCreateError = error;
  }

  reset(): void {
    this.runsById.clear();
    this.runIdByIdempotencyKey.clear();
    this.configuredSaveError = undefined;
    this.configuredCreateError = undefined;
  }

  getAllRuns(): readonly ExecutionRun[] {
    return [...this.runsById.values()].map(cloneExecutionRun);
  }

  async create(
    run: ExecutionRun,
  ): Promise<Result<ExecutionRun, ExecutionRunDuplicateError | ExecutionRunRepositoryError>> {
    if (this.configuredCreateError !== undefined) {
      return Result.fail(this.configuredCreateError);
    }

    if (this.runsById.has(run.id)) {
      return Result.fail(
        new ExecutionRunDuplicateError(`Execution run "${run.id}" already exists.`),
      );
    }

    if (this.runIdByIdempotencyKey.has(run.idempotencyKey)) {
      return Result.fail(
        new ExecutionRunDuplicateError(
          `Execution run already exists for idempotency key "${run.idempotencyKey}".`,
          'DUPLICATE_IDEMPOTENCY_KEY',
        ),
      );
    }

    const stored = cloneExecutionRun(run);
    this.runsById.set(run.id, stored);
    this.runIdByIdempotencyKey.set(run.idempotencyKey, run.id);

    return Result.ok(cloneExecutionRun(stored));
  }

  async findById(id: ExecutionRunId): Promise<ExecutionRun | null> {
    const run = this.runsById.get(id);
    return run === undefined ? null : cloneExecutionRun(run);
  }

  async findByIdempotencyKey(key: IdempotencyKey): Promise<ExecutionRun | null> {
    const runId = this.runIdByIdempotencyKey.get(key);
    if (runId === undefined) {
      return null;
    }

    return this.findById(runId);
  }

  async save(
    run: ExecutionRun,
  ): Promise<Result<ExecutionRun, ExecutionRunNotFoundError | ExecutionRunRepositoryError>> {
    if (this.configuredSaveError !== undefined) {
      return Result.fail(this.configuredSaveError);
    }

    if (!this.runsById.has(run.id)) {
      return Result.fail(new ExecutionRunNotFoundError(`Execution run "${run.id}" was not found.`));
    }

    const stored = cloneExecutionRun(run);
    this.runsById.set(run.id, stored);
    this.runIdByIdempotencyKey.set(run.idempotencyKey, run.id);

    return Result.ok(cloneExecutionRun(stored));
  }
}
