import type { AutomationStep } from './automation-step.js';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy.js';
import { AutomationValidationError } from './errors/automation-errors.js';

const validatePipelineId = (id: string): void => {
  if (id.trim().length === 0) {
    throw new AutomationValidationError('Pipeline id must not be empty.');
  }
};

const validateSteps = (steps: readonly AutomationStep[]): void => {
  if (steps.length === 0) {
    throw new AutomationValidationError('Pipeline must contain at least one step.');
  }

  const stepNames = new Set<string>();

  for (const step of steps) {
    if (step.stepName.trim().length === 0) {
      throw new AutomationValidationError('Step name must not be empty.');
    }

    if (stepNames.has(step.stepName)) {
      throw new AutomationValidationError(`Duplicate step name "${step.stepName}".`);
    }

    stepNames.add(step.stepName);
  }
};

const validateRetryPolicy = (retryPolicy: RetryPolicy): void => {
  if (retryPolicy.maxAttempts < 1) {
    throw new AutomationValidationError('Retry policy maxAttempts must be at least 1.');
  }

  if (retryPolicy.delayMs < 0) {
    throw new AutomationValidationError('Retry policy delayMs must be 0 or greater.');
  }
};

/**
 * Ordered workflow composed of automation steps.
 */
export class AutomationPipeline {
  readonly id: string;
  readonly steps: readonly AutomationStep[];
  readonly retryPolicy: RetryPolicy;

  constructor(params: { id: string; steps: readonly AutomationStep[]; retryPolicy?: RetryPolicy }) {
    validatePipelineId(params.id);
    validateSteps(params.steps);

    const retryPolicy = params.retryPolicy ?? DEFAULT_RETRY_POLICY;
    validateRetryPolicy(retryPolicy);

    this.id = params.id;
    this.steps = params.steps;
    this.retryPolicy = retryPolicy;
  }
}
