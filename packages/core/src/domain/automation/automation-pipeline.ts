import type { AutomationStep } from './automation-step.js';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy.js';

/**
 * Ordered workflow composed of automation steps.
 */
export class AutomationPipeline {
  readonly id: string;
  readonly steps: readonly AutomationStep[];
  readonly retryPolicy: RetryPolicy;

  constructor(params: { id: string; steps: readonly AutomationStep[]; retryPolicy?: RetryPolicy }) {
    this.id = params.id;
    this.steps = params.steps;
    this.retryPolicy = params.retryPolicy ?? DEFAULT_RETRY_POLICY;
  }
}
