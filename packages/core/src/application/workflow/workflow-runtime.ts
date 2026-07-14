import type { EventBus } from '../events/event-bus.js';
import type { WorkflowStepExecutorRegistry } from './workflow-step-executor.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type { WorkflowExecutionContext } from '../../domain/workflow/workflow-execution-context.js';
import type { WorkflowExecutionPolicy } from '../../domain/workflow/workflow-execution-policy.js';
import { DEFAULT_WORKFLOW_EXECUTION_POLICY } from '../../domain/workflow/workflow-execution-policy.js';
import {
  WorkflowExecution,
  type WorkflowExecutionId,
} from '../../domain/workflow/workflow-execution.js';
import { createWorkflowStepExecution } from '../../domain/workflow/workflow-step-execution.js';
import { createWorkflowExecutionResult } from '../../domain/workflow/workflow-execution-result.js';
import { WorkflowExecutionMetricsRecorder } from '../../domain/workflow/workflow-execution-metrics.js';
import {
  WorkflowCancelledError,
  WorkflowStepTimeoutError,
  WorkflowTimeoutError,
} from '../../domain/workflow/errors/workflow-errors.js';
import {
  createWorkflowCancelledEvent,
  createWorkflowCompletedEvent,
  createWorkflowFailedEvent,
  createWorkflowStartedEvent,
  createWorkflowStepCompletedEvent,
  createWorkflowStepFailedEvent,
  createWorkflowStepStartedEvent,
} from '../../domain/workflow/events/workflow-events.js';
import type { WorkflowExecutionResult } from '../../domain/workflow/workflow-execution-result.js';

import { setTimeout as delay } from 'node:timers/promises';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown workflow error';
};

export type WorkflowRuntimeDependencies = {
  readonly eventBus: EventBus;
  readonly stepExecutorRegistry: WorkflowStepExecutorRegistry;
};

type ActiveExecution = {
  readonly execution: WorkflowExecution;
  cancelled: boolean;
};

export type WorkflowRuntimeExecuteRequest = {
  readonly executionId: WorkflowExecutionId;
  readonly plan: WorkflowPlan;
  readonly context: WorkflowExecutionContext;
  readonly policy?: WorkflowExecutionPolicy;
};

/**
 * Executes workflow plans sequentially with policies, metrics, and events.
 */
export class WorkflowRuntime {
  private readonly dependencies: WorkflowRuntimeDependencies;
  private readonly activeExecutions = new Map<string, ActiveExecution>();

  constructor(dependencies: WorkflowRuntimeDependencies) {
    this.dependencies = dependencies;
  }

  async execute(request: WorkflowRuntimeExecuteRequest): Promise<WorkflowExecutionResult> {
    const policy = request.policy ?? DEFAULT_WORKFLOW_EXECUTION_POLICY;
    const metricsRecorder = new WorkflowExecutionMetricsRecorder(request.plan.steps.length);
    const startedAt = new Date();
    metricsRecorder.markStarted(startedAt);

    const execution = WorkflowExecution.create({
      id: request.executionId,
      workflowId: request.plan.workflowId,
      runId: request.plan.runId,
      sourcePlanId: request.plan.sourcePlanId,
      stepExecutions: request.plan.steps.map((step) =>
        createWorkflowStepExecution({
          stepId: step.id,
          stepName: step.name,
          stepType: step.stepType,
        }),
      ),
      startedAt,
    });

    this.activeExecutions.set(request.executionId, { execution, cancelled: false });

    try {
      execution.markRunning();
      execution.history.append({
        timestamp: new Date(),
        type: 'state-transition',
        message: 'Workflow execution started.',
        details: { state: 'Running' },
      });

      await this.dependencies.eventBus.publish(
        createWorkflowStartedEvent({
          executionId: execution.id,
          workflowId: execution.workflowId,
          runId: execution.runId,
          occurredAt: startedAt,
        }),
      );

      for (const stepDefinition of request.plan.steps) {
        this.assertNotCancelled(request.executionId);
        this.assertWorkflowTimeout(startedAt, policy, request.executionId);

        const stepResult = await this.executeStep({
          execution,
          stepDefinition,
          context: request.context,
          policy,
          metricsRecorder,
        });

        if (stepResult.status === 'failed') {
          const completedAt = new Date();
          metricsRecorder.markCompleted(completedAt);
          const metrics = metricsRecorder.snapshot();
          execution.markFailed(metrics, stepResult.reason);

          const result = this.buildResult(execution, startedAt, completedAt, metrics);
          await this.dependencies.eventBus.publish(createWorkflowFailedEvent(result));
          return result;
        }
      }

      const completedAt = new Date();
      metricsRecorder.markCompleted(completedAt);
      const metrics = metricsRecorder.snapshot();
      execution.markSucceeded(metrics);

      const result = this.buildResult(execution, startedAt, completedAt, metrics);
      await this.dependencies.eventBus.publish(createWorkflowCompletedEvent(result));
      return result;
    } catch (error: unknown) {
      const completedAt = new Date();
      metricsRecorder.markCompleted(completedAt);
      const metrics = metricsRecorder.snapshot();
      const failureReason = toErrorMessage(error);

      if (error instanceof WorkflowCancelledError) {
        metricsRecorder.markCancelled();
        execution.markCancelled(metricsRecorder.snapshot());
        execution.history.append({
          timestamp: completedAt,
          type: 'workflow-cancelled',
          message: failureReason,
        });

        const result = this.buildResult(
          execution,
          startedAt,
          completedAt,
          metricsRecorder.snapshot(),
        );
        await this.dependencies.eventBus.publish(createWorkflowCancelledEvent(result));
        return result;
      }

      if (error instanceof WorkflowTimeoutError) {
        execution.history.append({
          timestamp: completedAt,
          type: 'workflow-timeout',
          message: failureReason,
        });
      }

      try {
        execution.markFailed(metrics, failureReason);
      } catch {
        // Execution may already be terminal.
      }

      const result = this.buildResult(execution, startedAt, completedAt, metrics);
      await this.dependencies.eventBus.publish(createWorkflowFailedEvent(result));
      return result;
    } finally {
      this.activeExecutions.delete(request.executionId);
    }
  }

  cancel(executionId: string): boolean {
    const active = this.activeExecutions.get(executionId);

    if (active === undefined) {
      return false;
    }

    active.cancelled = true;
    return true;
  }

  private assertNotCancelled(executionId: string): void {
    const active = this.activeExecutions.get(executionId);

    if (active?.cancelled === true) {
      throw new WorkflowCancelledError(executionId);
    }
  }

  private assertWorkflowTimeout(
    startedAt: Date,
    policy: WorkflowExecutionPolicy,
    executionId: string,
  ): void {
    if (policy.workflowTimeoutMs === undefined) {
      return;
    }

    const elapsedMs = Date.now() - startedAt.getTime();

    if (elapsedMs > policy.workflowTimeoutMs) {
      throw new WorkflowTimeoutError(policy.workflowTimeoutMs, executionId);
    }
  }

  private async executeStep(params: {
    execution: WorkflowExecution;
    stepDefinition: import('../../domain/workflow/workflow-plan.js').WorkflowStepDefinition;
    context: WorkflowExecutionContext;
    policy: WorkflowExecutionPolicy;
    metricsRecorder: WorkflowExecutionMetricsRecorder;
  }): Promise<
    { readonly status: 'succeeded' } | { readonly status: 'failed'; readonly reason: string }
  > {
    const { execution, stepDefinition, context, policy, metricsRecorder } = params;
    const retryPolicy = stepDefinition.retryPolicy ?? policy.defaultRetryPolicy;
    const timeoutMs = stepDefinition.timeoutMs ?? policy.defaultStepTimeoutMs;
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < retryPolicy.maxAttempts) {
      this.assertNotCancelled(execution.id);
      attempts += 1;

      if (attempts > 1) {
        metricsRecorder.recordRetryAttempt();
        execution.history.append({
          timestamp: new Date(),
          type: 'step-retry',
          message: `Retrying step "${stepDefinition.name}".`,
          details: { stepId: stepDefinition.id, attempt: attempts },
        });

        if (retryPolicy.delayMs > 0) {
          await delay(retryPolicy.delayMs);
        }
      }

      const startedAt = new Date();
      const runningStep = createWorkflowStepExecution({
        stepId: stepDefinition.id,
        stepName: stepDefinition.name,
        stepType: stepDefinition.stepType,
        status: 'Running',
        attempts,
        startedAt,
      });

      execution.updateStepExecution(runningStep);
      execution.history.append({
        timestamp: startedAt,
        type: 'step-started',
        message: `Step "${stepDefinition.name}" started.`,
        details: { stepId: stepDefinition.id, attempt: attempts },
      });

      await this.dependencies.eventBus.publish(
        createWorkflowStepStartedEvent({
          executionId: execution.id,
          stepExecution: runningStep,
        }),
      );

      try {
        const output = await this.executeWithTimeout(
          () => this.dependencies.stepExecutorRegistry.execute(context, stepDefinition),
          timeoutMs,
          stepDefinition.id,
          execution.id,
        );

        this.assertNotCancelled(execution.id);

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        const succeededStep = createWorkflowStepExecution({
          stepId: stepDefinition.id,
          stepName: stepDefinition.name,
          stepType: stepDefinition.stepType,
          status: 'Succeeded',
          attempts,
          startedAt,
          completedAt,
          durationMs,
          output: output.output,
        });

        execution.updateStepExecution(succeededStep);
        metricsRecorder.recordStepCompleted(stepDefinition.id, durationMs);
        execution.history.append({
          timestamp: completedAt,
          type: 'step-completed',
          message: `Step "${stepDefinition.name}" completed.`,
          details: { stepId: stepDefinition.id, durationMs },
        });

        await this.dependencies.eventBus.publish(
          createWorkflowStepCompletedEvent({
            executionId: execution.id,
            stepExecution: succeededStep,
          }),
        );

        return { status: 'succeeded' };
      } catch (error: unknown) {
        if (error instanceof WorkflowCancelledError) {
          throw error;
        }

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        lastError = toErrorMessage(error);

        if (attempts < retryPolicy.maxAttempts) {
          continue;
        }

        const failedStep = createWorkflowStepExecution({
          stepId: stepDefinition.id,
          stepName: stepDefinition.name,
          stepType: stepDefinition.stepType,
          status: 'Failed',
          attempts,
          startedAt,
          completedAt,
          durationMs,
          error: lastError,
        });

        execution.updateStepExecution(failedStep);
        metricsRecorder.recordStepFailed(stepDefinition.id, durationMs);
        execution.history.append({
          timestamp: completedAt,
          type: 'step-failed',
          message: `Step "${stepDefinition.name}" failed.`,
          details: { stepId: stepDefinition.id, error: lastError },
        });

        await this.dependencies.eventBus.publish(
          createWorkflowStepFailedEvent({
            executionId: execution.id,
            stepExecution: failedStep,
          }),
        );

        return { status: 'failed', reason: lastError ?? 'Workflow step failed.' };
      }
    }

    return { status: 'failed', reason: lastError ?? 'Workflow step failed.' };
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number | undefined,
    stepId: string,
    executionId: string,
  ): Promise<T> {
    if (timeoutMs === undefined) {
      return operation();
    }

    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = globalThis.setTimeout(() => {
        reject(new WorkflowStepTimeoutError(stepId, timeoutMs, executionId));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) {
        globalThis.clearTimeout(timeoutHandle);
      }
    }
  }

  private buildResult(
    execution: WorkflowExecution,
    startedAt: Date,
    completedAt: Date,
    metrics: import('../../domain/workflow/workflow-execution-metrics.js').WorkflowExecutionMetrics,
  ): WorkflowExecutionResult {
    return createWorkflowExecutionResult({
      executionId: execution.id,
      workflowId: execution.workflowId,
      runId: execution.runId,
      sourcePlanId: execution.sourcePlanId,
      state: execution.state,
      startedAt,
      completedAt,
      stepExecutions: execution.stepExecutions,
      history: execution.history,
      metrics,
      failureReason: execution.failureReason,
    });
  }
}
