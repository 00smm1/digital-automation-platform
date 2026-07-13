import type { AutomationPipeline } from '../../domain/automation/automation-pipeline.js';
import type { AutomationContext } from '../../domain/automation/automation-context.js';
import type { AutomationStep, StepResult } from '../../domain/automation/automation-step.js';
import type { RetryPolicy } from '../../domain/automation/retry-policy.js';
import type { AutomationResult } from '../../domain/automation/automation-result.js';
import { createAutomationResult } from '../../domain/automation/automation-result.js';
import { createExecutionLog } from '../../domain/automation/execution-log.js';
import {
  AutomationExecutionError,
  AutomationValidationError,
} from '../../domain/automation/errors/automation-errors.js';
import {
  createAutomationFailedEvent,
  createAutomationSucceededEvent,
} from '../../domain/automation/events/automation-events.js';
import { Guard } from '../../shared/utils/guard.js';
import type { AutomationExecutorDependencies } from './automation-executor.dependencies.js';

import { setTimeout } from 'node:timers/promises';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown automation error';
};

/**
 * Executes automation pipelines and publishes completion events.
 */
export class AutomationExecutor {
  constructor(private readonly dependencies: AutomationExecutorDependencies) {}

  async execute(
    pipeline: AutomationPipeline,
    context: AutomationContext,
  ): Promise<AutomationResult> {
    const startedAt = new Date();
    const stepResults: StepResult[] = [];

    const baseLog = createExecutionLog({
      runId: context.runId,
      automationId: context.automationId,
      pipelineId: pipeline.id,
      startedAt,
      status: 'running',
    });

    try {
      await this.validateContext(context);

      for (const step of pipeline.steps) {
        const stepResult = await this.executeStep(step, context, pipeline.retryPolicy);
        stepResults.push(stepResult);

        if (stepResult.status === 'failed') {
          throw new AutomationExecutionError(
            stepResult.error ?? `Step "${step.stepName}" failed.`,
            step.stepName,
          );
        }
      }

      const completedAt = new Date();
      const result = createAutomationResult({
        runId: context.runId,
        automationId: context.automationId,
        pipelineId: pipeline.id,
        status: 'success',
        startedAt,
        completedAt,
        log: {
          ...baseLog,
          completedAt,
          status: 'success',
          steps: stepResults,
        },
      });

      await this.dependencies.eventBus.publish(createAutomationSucceededEvent(result));
      return result;
    } catch (error: unknown) {
      const completedAt = new Date();
      const failureReason = toErrorMessage(error);
      const result = createAutomationResult({
        runId: context.runId,
        automationId: context.automationId,
        pipelineId: pipeline.id,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason,
        log: {
          ...baseLog,
          completedAt,
          status: 'failed',
          steps: stepResults,
        },
      });

      await this.dependencies.eventBus.publish(createAutomationFailedEvent(result));
      return result;
    }
  }

  private async validateContext(context: AutomationContext): Promise<void> {
    if (this.dependencies.validate !== undefined) {
      await this.dependencies.validate(context);
      return;
    }

    try {
      Guard.againstEmptyString(context.automationId, 'automationId');
      Guard.againstEmptyString(context.runId, 'runId');
      Guard.againstEmptyString(context.order.id, 'order.id');
      Guard.againstEmptyString(context.customer.id, 'customer.id');
      Guard.againstEmptyString(context.payment.id, 'payment.id');
      Guard.againstEmptyString(context.payment.status, 'payment.status');
      Guard.againstEmptyString(context.provider.id, 'provider.id');
      Guard.againstEmptyString(context.provider.type, 'provider.type');
    } catch (error: unknown) {
      throw new AutomationValidationError(toErrorMessage(error), {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async executeStep(
    step: AutomationStep,
    context: AutomationContext,
    retryPolicy: RetryPolicy,
  ): Promise<StepResult> {
    const startedAt = new Date();
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < retryPolicy.maxAttempts) {
      attempts += 1;

      try {
        const result = await step.execute(context);

        if (result.status === 'failed') {
          lastError = result.error ?? `Step "${step.stepName}" failed.`;

          if (attempts < retryPolicy.maxAttempts) {
            await setTimeout(retryPolicy.delayMs);
            continue;
          }

          return {
            ...result,
            attempts,
            startedAt,
            completedAt: new Date(),
          };
        }

        return {
          ...result,
          stepName: step.stepName,
          attempts,
          startedAt: result.startedAt ?? startedAt,
          completedAt: result.completedAt ?? new Date(),
        };
      } catch (error: unknown) {
        lastError = toErrorMessage(error);

        if (attempts < retryPolicy.maxAttempts) {
          await setTimeout(retryPolicy.delayMs);
          continue;
        }
      }
    }

    return {
      stepName: step.stepName,
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      attempts,
      error: lastError ?? `Step "${step.stepName}" failed.`,
    };
  }
}
