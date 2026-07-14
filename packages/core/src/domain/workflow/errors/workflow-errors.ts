import { ApplicationError } from '../../../shared/errors/application-error.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import type { WorkflowExecutionState } from '../workflow-execution-state.js';

export class WorkflowExecutionError extends ApplicationError {
  readonly code = 'WORKFLOW_EXECUTION_FAILED';

  constructor(
    message: string,
    readonly executionId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class WorkflowStepExecutionError extends ApplicationError {
  readonly code = 'WORKFLOW_STEP_EXECUTION_FAILED';

  constructor(
    message: string,
    readonly stepId: string,
    readonly executionId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class WorkflowStepTimeoutError extends ApplicationError {
  readonly code = 'WORKFLOW_STEP_TIMEOUT';

  constructor(
    readonly stepId: string,
    readonly timeoutMs: number,
    readonly executionId?: string,
  ) {
    super(`Workflow step "${stepId}" timed out after ${timeoutMs}ms.`);
  }
}

export class WorkflowTimeoutError extends ApplicationError {
  readonly code = 'WORKFLOW_TIMEOUT';

  constructor(
    readonly timeoutMs: number,
    readonly executionId?: string,
  ) {
    super(`Workflow execution timed out after ${timeoutMs}ms.`);
  }
}

export class InvalidWorkflowTransitionError extends DomainError {
  readonly code = 'INVALID_WORKFLOW_TRANSITION';

  constructor(
    readonly executionId: string,
    readonly currentState: WorkflowExecutionState,
    readonly targetState: WorkflowExecutionState,
    options?: ErrorOptions,
  ) {
    super(
      `Cannot transition workflow "${executionId}" from "${currentState}" to "${targetState}".`,
      options,
    );
  }
}

export class WorkflowImmutableError extends DomainError {
  readonly code = 'WORKFLOW_IMMUTABLE';

  constructor(
    readonly executionId: string,
    readonly state: WorkflowExecutionState,
  ) {
    super(`Workflow "${executionId}" is immutable in state "${state}".`);
  }
}

export class WorkflowCancelledError extends ApplicationError {
  readonly code = 'WORKFLOW_CANCELLED';

  constructor(readonly executionId: string) {
    super(`Workflow "${executionId}" was cancelled.`);
  }
}
