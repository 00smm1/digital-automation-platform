import { DomainError } from '../../../shared/errors/domain-error.js';

export class InvalidWorkflowDefinitionError extends DomainError {
  readonly code = 'INVALID_WORKFLOW_DEFINITION';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidWorkflowStepDefinitionError extends DomainError {
  readonly code = 'INVALID_WORKFLOW_STEP_DEFINITION';

  constructor(message: string) {
    super(message);
  }
}

export class PipelineExecutionError extends DomainError {
  readonly code = 'PIPELINE_EXECUTION';

  readonly stepName: string;

  constructor(message: string, stepName: string) {
    super(message);
    this.stepName = stepName;
  }
}
