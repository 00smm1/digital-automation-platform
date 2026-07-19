import type { WorkflowDefinition } from '../../domain/workflow-pipeline/workflow-definition.js';
import type { PipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { clonePipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineExecutionResult } from '../../domain/workflow-pipeline/pipeline-execution-result.js';
import type { PipelineExecutionResult } from '../../domain/workflow-pipeline/pipeline-execution-result.js';
import { createPipelineStepExecutionResultFromError } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineRunnerDependencies } from './pipeline-runner.dependencies.js';

const isOperationalStepError = (error: unknown): boolean => {
  return error instanceof Error;
};

/**
 * Executes workflow definition pipelines sequentially.
 *
 * Fatal step failures stop the pipeline immediately. Completed steps executed
 * before the failure are preserved in the aggregate result.
 */
export class PipelineRunner {
  private readonly stepExecutorRegistry: PipelineRunnerDependencies['stepExecutorRegistry'];

  constructor(dependencies: PipelineRunnerDependencies) {
    this.stepExecutorRegistry = dependencies.stepExecutorRegistry;
  }

  async run(
    definition: WorkflowDefinition,
    context: PipelineStepExecutionContext,
  ): Promise<PipelineExecutionResult> {
    const startedAt = new Date();
    const completedSteps: PipelineStepExecutionResult[] = [];

    if (definition.steps.length === 0) {
      const completedAt = new Date();

      return createPipelineExecutionResult({
        executionId: context.executionId,
        workflowDefinitionId: context.workflowDefinitionId,
        runId: context.runId,
        startedAt,
        completedAt,
        completedSteps,
      });
    }

    for (const stepDefinition of definition.steps) {
      const stepStartedAt = new Date();

      try {
        const stepResult = await this.stepExecutorRegistry.execute(
          clonePipelineStepExecutionContext(context),
          stepDefinition,
        );

        if (stepResult.status === 'failed') {
          const completedAt = new Date();

          return createPipelineExecutionResult({
            executionId: context.executionId,
            workflowDefinitionId: context.workflowDefinitionId,
            runId: context.runId,
            startedAt,
            completedAt,
            completedSteps,
            failedStep: stepResult,
            failureReason: stepResult.failureReason ?? `Step "${stepDefinition.name}" failed.`,
          });
        }

        completedSteps.push(stepResult);
      } catch (error: unknown) {
        if (!isOperationalStepError(error)) {
          throw error;
        }

        const stepCompletedAt = new Date();
        const failedStep = createPipelineStepExecutionResultFromError({
          stepId: stepDefinition.id,
          stepName: stepDefinition.name,
          stepType: stepDefinition.stepType,
          startedAt: stepStartedAt,
          completedAt: stepCompletedAt,
          error,
        });

        const completedAt = new Date();

        return createPipelineExecutionResult({
          executionId: context.executionId,
          workflowDefinitionId: context.workflowDefinitionId,
          runId: context.runId,
          startedAt,
          completedAt,
          completedSteps,
          failedStep,
          failureReason: failedStep.failureReason,
        });
      }
    }

    const completedAt = new Date();

    return createPipelineExecutionResult({
      executionId: context.executionId,
      workflowDefinitionId: context.workflowDefinitionId,
      runId: context.runId,
      startedAt,
      completedAt,
      completedSteps,
    });
  }
}
