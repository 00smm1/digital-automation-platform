import type { PipelineStepId } from './pipeline-step-definition.js';

export const PIPELINE_STEP_EXECUTION_STATUSES = ['succeeded', 'failed'] as const;

export type PipelineStepExecutionStatus = (typeof PIPELINE_STEP_EXECUTION_STATUSES)[number];

/**
 * Outcome of executing one pipeline step.
 */
export type PipelineStepExecutionResult = {
  readonly stepId: PipelineStepId;
  readonly stepName: string;
  readonly stepType: string;
  readonly status: PipelineStepExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly failureReason?: string;
};

export const createPipelineStepExecutionResult = (params: {
  stepId: PipelineStepId;
  stepName: string;
  stepType: string;
  status: PipelineStepExecutionStatus;
  startedAt: Date;
  completedAt: Date;
  output?: Readonly<Record<string, unknown>>;
  failureReason?: string;
}): PipelineStepExecutionResult => {
  const durationMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime());

  return {
    stepId: params.stepId,
    stepName: params.stepName,
    stepType: params.stepType,
    status: params.status,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    durationMs,
    output: params.output === undefined ? undefined : { ...params.output },
    failureReason: params.failureReason,
  };
};

export const createPipelineStepExecutionResultFromError = (params: {
  stepId: PipelineStepId;
  stepName: string;
  stepType: string;
  startedAt: Date;
  completedAt: Date;
  error: unknown;
}): PipelineStepExecutionResult => {
  const failureReason =
    params.error instanceof Error ? params.error.message : 'Pipeline step execution failed.';

  return createPipelineStepExecutionResult({
    stepId: params.stepId,
    stepName: params.stepName,
    stepType: params.stepType,
    status: 'failed',
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    failureReason,
  });
};
