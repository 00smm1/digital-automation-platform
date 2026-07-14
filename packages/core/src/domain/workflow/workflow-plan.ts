import type { Identifier } from '../../shared/types/identifier.js';
import type { RetryPolicy } from '../automation/retry-policy.js';

export type WorkflowStepId = Identifier<'WorkflowStep'>;

export type WorkflowStepDefinition = {
  readonly id: WorkflowStepId;
  readonly name: string;
  readonly stepType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly retryPolicy?: RetryPolicy;
  readonly timeoutMs?: number;
};

export type WorkflowPlan = {
  readonly workflowId: string;
  readonly runId: string;
  readonly sourcePlanId: string;
  readonly steps: readonly WorkflowStepDefinition[];
};

export const createWorkflowPlan = (params: WorkflowPlan): WorkflowPlan => params;

export const createWorkflowStepDefinition = (
  params: WorkflowStepDefinition,
): WorkflowStepDefinition => params;
