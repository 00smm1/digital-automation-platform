import type { WorkflowExecutionResult } from '../workflow/workflow-execution-result.js';

export type WorkflowExecutionOutcomeStatus = 'succeeded' | 'failed' | 'cancelled';

/**
 * Structured result of a single workflow execution attempt.
 */
export type WorkflowExecutionOutcome = {
  readonly executionId: string;
  readonly automationId: string;
  readonly workflowId: string;
  readonly status: WorkflowExecutionOutcomeStatus;
  readonly workflowResult?: WorkflowExecutionResult;
  readonly failureReason?: string;
};

export const createWorkflowExecutionOutcome = (params: {
  executionId: string;
  automationId: string;
  workflowId: string;
  status: WorkflowExecutionOutcomeStatus;
  workflowResult?: WorkflowExecutionResult;
  failureReason?: string;
}): WorkflowExecutionOutcome => ({
  executionId: params.executionId,
  automationId: params.automationId,
  workflowId: params.workflowId,
  status: params.status,
  workflowResult: params.workflowResult,
  failureReason: params.failureReason,
});

export const createWorkflowExecutionOutcomeFromResult = (params: {
  automationId: string;
  result: WorkflowExecutionResult;
}): WorkflowExecutionOutcome => ({
  executionId: params.result.executionId,
  automationId: params.automationId,
  workflowId: params.result.workflowId,
  status:
    params.result.status === 'Succeeded'
      ? 'succeeded'
      : params.result.status === 'Cancelled'
        ? 'cancelled'
        : 'failed',
  workflowResult: params.result,
  failureReason: params.result.failureReason,
});

export const createWorkflowExecutionOutcomeFromError = (params: {
  executionId: string;
  automationId: string;
  workflowId: string;
  error: unknown;
}): WorkflowExecutionOutcome => {
  const message =
    params.error instanceof Error ? params.error.message : 'Workflow execution failed.';

  return createWorkflowExecutionOutcome({
    executionId: params.executionId,
    automationId: params.automationId,
    workflowId: params.workflowId,
    status: 'failed',
    failureReason: message,
  });
};
