import type { ExecutionPlan } from '../order/execution-plan.js';

/**
 * Runtime context passed to every workflow step executor.
 */
export type WorkflowExecutionContext = {
  readonly executionId: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly sourcePlanId: string;
  readonly sourcePlan?: ExecutionPlan;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export const createWorkflowExecutionContext = (
  params: WorkflowExecutionContext,
): WorkflowExecutionContext => params;
