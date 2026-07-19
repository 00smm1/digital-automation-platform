import type { PipelineStep } from '../../domain/workflow-pipeline/pipeline-step.js';
import type {
  PipelineStepExecutor,
  PipelineStepExecutorRegistry,
} from './pipeline-step-executor.js';
import type { PipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { PipelineStepDefinition } from '../../domain/workflow-pipeline/pipeline-step-definition.js';
import type { PipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { createPipelineStepExecutionResultFromError } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';

/**
 * In-memory pipeline step executor registry for tests and local composition.
 */
export class InMemoryPipelineStepExecutorRegistry implements PipelineStepExecutorRegistry {
  private readonly executors = new Map<string, PipelineStepExecutor>();

  register(stepType: string, executor: PipelineStepExecutor): void {
    this.executors.set(stepType, executor);
  }

  registerStep(step: PipelineStep): void {
    this.register(step.stepType, (context, definition) => step.execute(context, definition));
  }

  async execute(
    context: PipelineStepExecutionContext,
    step: PipelineStepDefinition,
  ): Promise<PipelineStepExecutionResult> {
    const executor = this.executors.get(step.stepType);

    if (executor === undefined) {
      throw new Error(`No pipeline step executor registered for type "${step.stepType}".`);
    }

    return executor(context, step);
  }
}

export const createDeterministicPipelineStepExecutor = (params: {
  stepType: string;
  output?: Readonly<Record<string, unknown>>;
  failWith?: Error;
}): PipelineStepExecutor => {
  return async (context, step) => {
    const startedAt = new Date();

    if (params.failWith !== undefined) {
      throw params.failWith;
    }

    const completedAt = new Date();

    return {
      stepId: step.id,
      stepName: step.name,
      stepType: step.stepType,
      status: 'succeeded',
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      output: params.output ?? { executionId: context.executionId },
    };
  };
};

export const createPipelineStepExecutionResultFromRegistryError = (
  step: PipelineStepDefinition,
  startedAt: Date,
  completedAt: Date,
  error: unknown,
): PipelineStepExecutionResult =>
  createPipelineStepExecutionResultFromError({
    stepId: step.id,
    stepName: step.name,
    stepType: step.stepType,
    startedAt,
    completedAt,
    error,
  });
