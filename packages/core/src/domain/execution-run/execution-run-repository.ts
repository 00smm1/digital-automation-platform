import type { Result } from '../../shared/types/result.js';
import type { ExecutionRun } from './execution-run.js';
import type { ExecutionRunId } from './execution-run-id.js';
import type { IdempotencyKey } from '../inbound-event/idempotency-key.js';
import type {
  ExecutionRunDuplicateError,
  ExecutionRunNotFoundError,
  ExecutionRunRepositoryError,
} from './errors/execution-run-errors.js';

export type ExecutionRunRepository = {
  create(
    run: ExecutionRun,
  ): Promise<Result<ExecutionRun, ExecutionRunDuplicateError | ExecutionRunRepositoryError>>;

  findById(id: ExecutionRunId): Promise<ExecutionRun | null>;

  findByIdempotencyKey(key: IdempotencyKey): Promise<ExecutionRun | null>;

  save(
    run: ExecutionRun,
  ): Promise<Result<ExecutionRun, ExecutionRunNotFoundError | ExecutionRunRepositoryError>>;
};
