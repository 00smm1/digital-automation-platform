import type { PipelineStepDefinition } from './pipeline-step-definition.js';
import type { PipelineStepExecutionContext } from './pipeline-step-execution-context.js';
import type { PipelineStepExecutionResult } from './pipeline-step-execution-result.js';

/**
 * Contract for a pipeline step implementation.
 */
export interface PipelineStep {
  readonly stepType: string;
  execute(
    context: PipelineStepExecutionContext,
    step: PipelineStepDefinition,
  ): Promise<PipelineStepExecutionResult>;
}
