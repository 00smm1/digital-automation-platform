import { DomainError } from '../../../shared/errors/domain-error.js';
import type { Identifier } from '../../../shared/types/identifier.js';

type AutomationDefinitionId = Identifier<'AutomationDefinition'>;

export class InvalidAutomationDefinitionError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_DEFINITION';

  constructor(
    message: string,
    readonly definitionId?: AutomationDefinitionId,
  ) {
    super(message);
  }
}

export class InvalidAutomationTriggerError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_TRIGGER';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidAutomationConditionError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_CONDITION';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidConditionOperatorError extends DomainError {
  readonly code = 'INVALID_CONDITION_OPERATOR';

  constructor(operator: string) {
    super(`Unsupported condition operator "${operator}".`);
  }
}

export class InvalidAutomationConditionGroupError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_CONDITION_GROUP';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidAutomationPriorityError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_PRIORITY';

  constructor(priority: number) {
    super(`Automation priority must be a safe integer. Received: ${priority}.`);
  }
}

export class InvalidAutomationWorkflowReferenceError extends DomainError {
  readonly code = 'INVALID_AUTOMATION_WORKFLOW_REFERENCE';

  constructor(message: string) {
    super(message);
  }
}
