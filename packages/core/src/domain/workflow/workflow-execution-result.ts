import type { WorkflowExecutionState } from './workflow-execution-state.js';
import type { WorkflowStepExecution } from './workflow-step-execution.js';
import type { WorkflowExecutionHistory } from './workflow-execution-history.js';
import type { WorkflowExecutionMetrics } from './workflow-execution-metrics.js';

export type WorkflowExecutionResultStatus = 'Succeeded' | 'Failed' | 'Cancelled';

/**
 * Final outcome of a workflow runtime execution.
 */
export type WorkflowExecutionResult = {
  readonly executionId: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly sourcePlanId: string;
  readonly state: WorkflowExecutionState;
  readonly status: WorkflowExecutionResultStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly stepExecutions: readonly WorkflowStepExecution[];
  readonly history: WorkflowExecutionHistory;
  readonly metrics: WorkflowExecutionMetrics;
  readonly failureReason?: string;
};

export const createWorkflowExecutionResult = (params: {
  executionId: string;
  workflowId: string;
  runId: string;
  sourcePlanId: string;
  state: WorkflowExecutionState;
  startedAt: Date;
  completedAt: Date;
  stepExecutions: readonly WorkflowStepExecution[];
  history: WorkflowExecutionHistory;
  metrics: WorkflowExecutionMetrics;
  failureReason?: string;
}): WorkflowExecutionResult => ({
  executionId: params.executionId,
  workflowId: params.workflowId,
  runId: params.runId,
  sourcePlanId: params.sourcePlanId,
  state: params.state,
  status:
    params.state === 'Succeeded'
      ? 'Succeeded'
      : params.state === 'Cancelled'
        ? 'Cancelled'
        : 'Failed',
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  stepExecutions: params.stepExecutions,
  history: params.history,
  metrics: params.metrics,
  failureReason: params.failureReason,
});
