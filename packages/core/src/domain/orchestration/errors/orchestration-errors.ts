import { ApplicationError } from '../../../shared/errors/application-error.js';

export class PlatformEventOrchestrationError extends ApplicationError {
  readonly code = 'PLATFORM_EVENT_ORCHESTRATION_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
