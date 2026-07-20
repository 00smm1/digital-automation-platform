import { DomainError } from '../../../shared/errors/domain-error.js';

export class ExecutionRunDuplicateError extends DomainError {
  readonly code = 'EXECUTION_RUN_DUPLICATE';

  constructor(
    message: string,
    readonly failureCode: string = 'DUPLICATE_RUN',
  ) {
    super(message);
  }
}

export class ExecutionRunNotFoundError extends DomainError {
  readonly code = 'EXECUTION_RUN_NOT_FOUND';

  constructor(
    message: string,
    readonly failureCode: string = 'RUN_NOT_FOUND',
  ) {
    super(message);
  }
}

export class ExecutionRunTransitionError extends DomainError {
  readonly code = 'EXECUTION_RUN_TRANSITION';

  constructor(
    message: string,
    readonly failureCode: string = 'INVALID_TRANSITION',
  ) {
    super(message);
  }
}

export class ExecutionRunRepositoryError extends DomainError {
  readonly code = 'EXECUTION_RUN_REPOSITORY';

  constructor(
    message: string,
    readonly failureCode: string = 'REPOSITORY_OPERATION_FAILED',
  ) {
    super(message);
  }
}

export class ExecutionRunLifecycleError extends DomainError {
  readonly code = 'EXECUTION_RUN_LIFECYCLE';

  constructor(
    message: string,
    readonly failureCode: string = 'LIFECYCLE_OPERATION_FAILED',
  ) {
    super(message);
  }
}
