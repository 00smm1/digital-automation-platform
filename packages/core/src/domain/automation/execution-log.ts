import type { StepResult } from './automation-step.js';

export type ExecutionStatus = 'running' | 'success' | 'failed';

/**
 * Audit trail for an automation run.
 */
export type ExecutionLog = {
  readonly runId: string;
  readonly automationId: string;
  readonly pipelineId: string;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly status: ExecutionStatus;
  readonly steps: readonly StepResult[];
};

export const createExecutionLog = (params: {
  runId: string;
  automationId: string;
  pipelineId: string;
  startedAt: Date;
  status?: ExecutionStatus;
  steps?: readonly StepResult[];
  completedAt?: Date;
}): ExecutionLog => ({
  runId: params.runId,
  automationId: params.automationId,
  pipelineId: params.pipelineId,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  status: params.status ?? 'running',
  steps: params.steps ?? [],
});
