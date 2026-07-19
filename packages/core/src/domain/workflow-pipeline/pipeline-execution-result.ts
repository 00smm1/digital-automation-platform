import type { PipelineStepExecutionResult } from './pipeline-step-execution-result.js';

export const PIPELINE_EXECUTION_STATUSES = ['succeeded', 'failed', 'empty'] as const;

export type PipelineExecutionStatus = (typeof PIPELINE_EXECUTION_STATUSES)[number];

/**
 * Aggregate outcome of executing one workflow definition pipeline.
 */
export type PipelineExecutionResult = {
  readonly executionId: string;
  readonly workflowDefinitionId: string;
  readonly runId: string;
  readonly status: PipelineExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly completedSteps: readonly PipelineStepExecutionResult[];
  readonly failedStep?: PipelineStepExecutionResult;
  readonly failureReason?: string;
};

export const createPipelineExecutionResult = (params: {
  executionId: string;
  workflowDefinitionId: string;
  runId: string;
  startedAt: Date;
  completedAt: Date;
  completedSteps: readonly PipelineStepExecutionResult[];
  failedStep?: PipelineStepExecutionResult;
  failureReason?: string;
}): PipelineExecutionResult => {
  const durationMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime());
  const hasFailedStep = params.failedStep !== undefined;

  let status: PipelineExecutionStatus;

  if (params.completedSteps.length === 0 && !hasFailedStep) {
    status = 'empty';
  } else if (hasFailedStep) {
    status = 'failed';
  } else {
    status = 'succeeded';
  }

  return {
    executionId: params.executionId,
    workflowDefinitionId: params.workflowDefinitionId,
    runId: params.runId,
    status,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    durationMs,
    completedSteps: params.completedSteps,
    failedStep: params.failedStep,
    failureReason: params.failureReason,
  };
};
