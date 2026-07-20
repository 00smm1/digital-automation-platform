import type { WorkflowDefinition } from '../../domain/workflow-pipeline/workflow-definition.js';
import type { PipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineExecutionResult } from '../../domain/workflow-pipeline/pipeline-execution-result.js';
import type { PipelineExecutionResult } from '../../domain/workflow-pipeline/pipeline-execution-result.js';
import { createPipelineStepExecutionResultFromError } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { ExecutionRunLifecycleError } from '../../domain/execution-run/errors/execution-run-errors.js';
import { createSystemClock, type Clock } from '../../shared/time/clock.js';
import type { ExecutionRunId } from '../../domain/execution-run/execution-run-id.js';
import { sanitizeExecutionMetadata } from '../execution-run/execution-run-safety.js';
import type { PipelineRunnerDependencies } from './pipeline-runner.dependencies.js';

const isOperationalStepError = (error: unknown): boolean => {
  return error instanceof Error;
};

const readExecutionRunId = (context: PipelineStepExecutionContext): ExecutionRunId | undefined => {
  const executionRunId = context.metadata.executionRunId;

  return typeof executionRunId === 'string' ? (executionRunId as ExecutionRunId) : undefined;
};

/**
 * Executes workflow definition pipelines sequentially.
 *
 * Fatal step failures stop the pipeline immediately. Completed steps executed
 * before the failure are preserved in the aggregate result.
 */
export class PipelineRunner {
  private readonly stepExecutorRegistry: PipelineRunnerDependencies['stepExecutorRegistry'];
  private readonly progressObserver?: PipelineRunnerDependencies['progressObserver'];
  private readonly clock: Clock;

  constructor(dependencies: PipelineRunnerDependencies) {
    this.stepExecutorRegistry = dependencies.stepExecutorRegistry;
    this.progressObserver = dependencies.progressObserver;
    this.clock = dependencies.clock ?? createSystemClock();
  }

  async run(
    definition: WorkflowDefinition,
    context: PipelineStepExecutionContext,
  ): Promise<PipelineExecutionResult> {
    const startedAt = this.clock.now();
    const completedSteps: PipelineStepExecutionResult[] = [];
    const executionRunId = readExecutionRunId(context);

    if (definition.steps.length === 0) {
      const completedAt = this.clock.now();

      return createPipelineExecutionResult({
        executionId: context.executionId,
        workflowDefinitionId: context.workflowDefinitionId,
        runId: context.runId,
        startedAt,
        completedAt,
        completedSteps,
      });
    }

    for (let index = 0; index < definition.steps.length; index += 1) {
      const stepDefinition = definition.steps[index]!;
      const executionOrder = index + 1;
      const stepStartedAt = this.clock.now();
      const stepContext = createPipelineStepExecutionContext({
        ...context,
        priorStepOutputs: completedSteps,
      });

      if (executionRunId !== undefined && this.progressObserver !== undefined) {
        const startedResult = await this.progressObserver.onStepStarted({
          executionRunId,
          stepId: stepDefinition.id,
          stepName: stepDefinition.name,
          executionOrder,
        });

        if (!startedResult.ok) {
          throw new ExecutionRunLifecycleError(
            startedResult.error.message,
            startedResult.error.failureCode,
          );
        }
      }

      try {
        const stepResult = await this.stepExecutorRegistry.execute(stepContext, stepDefinition);

        if (stepResult.status === 'failed') {
          if (executionRunId !== undefined && this.progressObserver !== undefined) {
            const failureCode =
              stepResult.output?.failureCode !== undefined
                ? String(stepResult.output.failureCode)
                : undefined;
            const failedResult = await this.progressObserver.onStepFailed({
              executionRunId,
              stepId: stepDefinition.id,
              stepName: stepDefinition.name,
              executionOrder,
              failureCode,
              failureReason: stepResult.failureReason,
            });

            if (!failedResult.ok) {
              throw new ExecutionRunLifecycleError(
                failedResult.error.message,
                failedResult.error.failureCode,
              );
            }
          }

          const completedAt = this.clock.now();

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

        if (executionRunId !== undefined && this.progressObserver !== undefined) {
          const completedResult = await this.progressObserver.onStepCompleted({
            executionRunId,
            stepId: stepDefinition.id,
            stepName: stepDefinition.name,
            executionOrder,
            safeOutcomeMetadata: sanitizeExecutionMetadata(stepResult.output),
          });

          if (!completedResult.ok) {
            throw new ExecutionRunLifecycleError(
              completedResult.error.message,
              completedResult.error.failureCode,
            );
          }
        }

        completedSteps.push(stepResult);
      } catch (error: unknown) {
        if (!isOperationalStepError(error)) {
          throw error;
        }

        const stepCompletedAt = this.clock.now();
        const failedStep = createPipelineStepExecutionResultFromError({
          stepId: stepDefinition.id,
          stepName: stepDefinition.name,
          stepType: stepDefinition.stepType,
          startedAt: stepStartedAt,
          completedAt: stepCompletedAt,
          error,
        });

        if (executionRunId !== undefined && this.progressObserver !== undefined) {
          const failedResult = await this.progressObserver.onStepFailed({
            executionRunId,
            stepId: stepDefinition.id,
            stepName: stepDefinition.name,
            executionOrder,
            failureReason: failedStep.failureReason,
          });

          if (!failedResult.ok) {
            throw new ExecutionRunLifecycleError(
              failedResult.error.message,
              failedResult.error.failureCode,
            );
          }
        }

        const completedAt = this.clock.now();

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

    const completedAt = this.clock.now();

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
