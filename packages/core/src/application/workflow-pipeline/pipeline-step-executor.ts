import type { PipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { PipelineStepDefinition } from '../../domain/workflow-pipeline/pipeline-step-definition.js';
import type { PipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';

/**
 * Executes one pipeline step without transport or infrastructure concerns.
 */
export type PipelineStepExecutor = (
  context: PipelineStepExecutionContext,
  step: PipelineStepDefinition,
) => Promise<PipelineStepExecutionResult>;

export type PipelineStepExecutorRegistry = {
  register(stepType: string, executor: PipelineStepExecutor): void;
  execute(
    context: PipelineStepExecutionContext,
    step: PipelineStepDefinition,
  ): Promise<PipelineStepExecutionResult>;
};
