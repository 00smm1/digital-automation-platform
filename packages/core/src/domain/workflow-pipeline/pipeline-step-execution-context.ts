import type { PipelineStepExecutionResult } from './pipeline-step-execution-result.js';

const cloneRecord = (value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  structuredClone(value);

/**
 * Immutable runtime context passed to every pipeline step executor.
 */
export type PipelineStepExecutionContext = {
  readonly executionId: string;
  readonly workflowDefinitionId: string;
  readonly runId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly priorStepOutputs: readonly PipelineStepExecutionResult[];
};

export const createPipelineStepExecutionContext = (
  params: PipelineStepExecutionContext,
): PipelineStepExecutionContext => ({
  executionId: params.executionId,
  workflowDefinitionId: params.workflowDefinitionId,
  runId: params.runId,
  input: cloneRecord(params.input),
  metadata: cloneRecord(params.metadata),
  priorStepOutputs: params.priorStepOutputs.map((output) => ({ ...output })),
});

export const clonePipelineStepExecutionContext = (
  context: PipelineStepExecutionContext,
): PipelineStepExecutionContext => createPipelineStepExecutionContext(context);
