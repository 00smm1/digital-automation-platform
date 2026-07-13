import { ApplicationError } from '../../../shared/errors/application-error.js';

export class AutomationExecutionError extends ApplicationError {
  readonly code = 'AUTOMATION_EXECUTION_FAILED';

  constructor(
    message: string,
    readonly stepName?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class AutomationValidationError extends ApplicationError {
  readonly code = 'AUTOMATION_VALIDATION_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
