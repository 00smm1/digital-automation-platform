import { Result } from '../../shared/types/result.js';
import type { Clock } from '../../shared/time/clock.js';
import { createSystemClock } from '../../shared/time/clock.js';
import type { ExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import type { IdempotencyKey } from '../../domain/inbound-event/idempotency-key.js';
import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import type { PlatformEventOrchestrationResult } from '../../domain/orchestration/platform-event-orchestration-result.js';
import type { WorkflowDefinition } from '../../domain/workflow-pipeline/workflow-definition.js';
import { createExecutionRun, type ExecutionRun } from '../../domain/execution-run/execution-run.js';
import {
  createExecutionRunId,
  type ExecutionRunId,
} from '../../domain/execution-run/execution-run-id.js';
import {
  canTransitionExecutionRunStatus,
  isTerminalExecutionRunStatus,
} from '../../domain/execution-run/execution-run-status.js';
import {
  createExecutionRunStepProgress,
  type ExecutionRunStepProgress,
} from '../../domain/execution-run/execution-run-step-progress.js';
import { createExecutionRunOutcomeSummary } from '../../domain/execution-run/execution-run-outcome-summary.js';
import type { ExecutionRunRepository } from '../../domain/execution-run/execution-run-repository.js';
import { ExecutionRunLifecycleError } from '../../domain/execution-run/errors/execution-run-errors.js';
import type { ExecutionRunAuditRecord } from '../../domain/execution-run/execution-run-audit-record.js';
import type { ExecutionRunLifecyclePort } from './execution-run-lifecycle-port.js';
import type { PipelineExecutionProgressObserver } from './pipeline-execution-progress-observer.js';
import { mapExecutionRunToAuditRecord } from './execution-run-audit-mapper.js';
import {
  extractExternalOrderReference,
  sanitizeExecutionMetadata,
  sanitizeUnexpectedErrorMessage,
  sanitizeStepFailureReason,
} from './execution-run-safety.js';

export type ExecutionRunCoordinatorDependencies = {
  readonly repository: ExecutionRunRepository;
  readonly clock?: Clock;
};

const VALIDATION_FAILURE_CODE = 'VALIDATION_FAILED';

/**
 * Coordinates execution-run lifecycle recording for accepted inbound processing.
 */
export class ExecutionRunCoordinator
  implements ExecutionRunLifecyclePort, PipelineExecutionProgressObserver
{
  private readonly repository: ExecutionRunRepository;
  private readonly clock: Clock;

  constructor(dependencies: ExecutionRunCoordinatorDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock ?? createSystemClock();
  }

  async createRun(params: {
    envelope: ExternalEventEnvelope;
    normalizedEvent: NormalizedPlatformEvent;
    idempotencyKey: IdempotencyKey;
  }): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    const run = createExecutionRun({
      id: createExecutionRunId({ idempotencyKey: params.idempotencyKey }),
      sourceId: params.envelope.sourceId,
      externalEventId: params.envelope.externalEventId,
      normalizedEventId: params.normalizedEvent.eventId,
      idempotencyKey: params.idempotencyKey,
      externalOrderReference: extractExternalOrderReference(params.normalizedEvent.payload),
      status: 'received',
      createdAt: this.clock.now(),
      matchedAutomationIds: [],
      workflowIds: [],
      stepProgress: [],
    });

    const createResult = await this.repository.create(run);

    if (!createResult.ok) {
      return Result.fail(
        new ExecutionRunLifecycleError(createResult.error.message, createResult.error.failureCode),
      );
    }

    return Result.ok(createResult.value);
  }

  async startProcessing(
    executionRunId: ExecutionRunId,
  ): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    return this.transitionRun({
      executionRunId,
      toStatus: 'processing',
      startedAt: this.clock.now(),
    });
  }

  async onAutomationsMatched(params: {
    executionRunId: ExecutionRunId;
    matchedAutomations: readonly {
      readonly automationId: string;
      readonly workflowId: string;
    }[];
  }): Promise<Result<void, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(params.executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    const updated = createExecutionRun({
      ...existing,
      matchedAutomationIds: params.matchedAutomations.map((automation) => automation.automationId),
      workflowIds: params.matchedAutomations.map((automation) => automation.workflowId),
    });

    const saveResult = await this.repository.save(updated);

    if (!saveResult.ok) {
      return Result.fail(
        new ExecutionRunLifecycleError(saveResult.error.message, saveResult.error.failureCode),
      );
    }

    return Result.ok(undefined);
  }

  async onStepStarted(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
  }): Promise<Result<void, ExecutionRunLifecycleError>> {
    return this.upsertStepProgress(params.executionRunId, {
      stepId: params.stepId,
      stepName: params.stepName,
      executionOrder: params.executionOrder,
      status: 'running',
      startedAt: this.clock.now(),
    });
  }

  async onStepCompleted(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
    safeOutcomeMetadata?: Readonly<Record<string, unknown>>;
  }): Promise<Result<void, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(params.executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    const currentStep = existing.stepProgress.find((step) => step.stepId === params.stepId);

    return this.upsertStepProgress(params.executionRunId, {
      stepId: params.stepId,
      stepName: params.stepName,
      executionOrder: params.executionOrder,
      status: 'completed',
      startedAt: currentStep?.startedAt ?? this.clock.now(),
      completedAt: this.clock.now(),
      safeOutcomeMetadata: sanitizeExecutionMetadata(params.safeOutcomeMetadata),
    });
  }

  async onStepFailed(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
    failureCode?: string;
    failureReason?: string;
  }): Promise<Result<void, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(params.executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    const currentStep = existing.stepProgress.find((step) => step.stepId === params.stepId);

    return this.upsertStepProgress(params.executionRunId, {
      stepId: params.stepId,
      stepName: params.stepName,
      executionOrder: params.executionOrder,
      status: 'failed',
      startedAt: currentStep?.startedAt ?? this.clock.now(),
      completedAt: this.clock.now(),
      failureCode: params.failureCode,
      failureReason: sanitizeStepFailureReason(params),
    });
  }

  async onStepsSkipped(params: {
    executionRunId: ExecutionRunId;
    steps: readonly {
      readonly stepId: string;
      readonly stepName: string;
      readonly executionOrder: number;
    }[];
  }): Promise<Result<void, ExecutionRunLifecycleError>> {
    for (const step of params.steps) {
      const result = await this.upsertStepProgress(params.executionRunId, {
        stepId: step.stepId,
        stepName: step.stepName,
        executionOrder: step.executionOrder,
        status: 'skipped',
      });

      if (!result.ok) {
        return result;
      }
    }

    return Result.ok(undefined);
  }

  async finalizeFromOrchestration(params: {
    executionRunId: ExecutionRunId;
    orchestrationResult: PlatformEventOrchestrationResult;
    workflowDefinition?: WorkflowDefinition;
  }): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(params.executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    const primaryOutcome = params.orchestrationResult.executionOutcomes[0];
    const pipelineResult = primaryOutcome?.pipelineExecutionResult;
    const failedStep = pipelineResult?.failedStep;
    const validationFailureCode = this.extractValidationFailureCode(
      pipelineResult?.failedStep?.output,
    );

    if (params.workflowDefinition !== undefined && pipelineResult?.status === 'failed') {
      const skippedSteps = params.workflowDefinition.steps
        .map((step, index) => ({ step, executionOrder: index + 1 }))
        .filter(({ step }) => {
          const completed = pipelineResult.completedSteps.some(
            (completedStep) => completedStep.stepId === step.id,
          );
          const failed = failedStep?.stepId === step.id;
          return !completed && !failed;
        })
        .map(({ step, executionOrder }) => ({
          stepId: step.id,
          stepName: step.name,
          executionOrder,
        }));

      if (skippedSteps.length > 0) {
        const skippedResult = await this.onStepsSkipped({
          executionRunId: params.executionRunId,
          steps: skippedSteps,
        });

        if (!skippedResult.ok) {
          return Result.fail(skippedResult.error);
        }
      }
    }

    const outcomeSummary = createExecutionRunOutcomeSummary({
      orchestrationStatus: params.orchestrationResult.overallStatus,
      matchedAutomationCount: params.orchestrationResult.matchedAutomationCount,
      successfulExecutionCount: params.orchestrationResult.successfulExecutionCount,
      failedExecutionCount: params.orchestrationResult.failedExecutionCount,
      completedStepCount: pipelineResult?.completedSteps.length ?? 0,
      failedStepName: failedStep?.stepName,
    });

    if (validationFailureCode === VALIDATION_FAILURE_CODE) {
      return this.transitionRun({
        executionRunId: params.executionRunId,
        toStatus: 'rejected',
        completedAt: this.clock.now(),
        failureCode: VALIDATION_FAILURE_CODE,
        failureReason: failedStep?.failureReason ?? 'Fulfillment request validation failed.',
        outcomeSummary,
        pipelineExecutionId: pipelineResult?.executionId,
      });
    }

    if (params.orchestrationResult.overallStatus === 'failed') {
      return this.transitionRun({
        executionRunId: params.executionRunId,
        toStatus: 'failed',
        completedAt: this.clock.now(),
        failureCode: failedStep?.output?.failureCode
          ? String(failedStep.output.failureCode)
          : params.orchestrationResult.matchedAutomationCount === 0
            ? 'NO_MATCH'
            : 'ORCHESTRATION_FAILED',
        failureReason:
          sanitizeStepFailureReason({
            failureCode: failedStep?.output?.failureCode
              ? String(failedStep.output.failureCode)
              : undefined,
            failureReason: failedStep?.failureReason,
          }) ?? `Platform orchestration failed for event "${params.orchestrationResult.eventId}".`,
        outcomeSummary,
        pipelineExecutionId: pipelineResult?.executionId,
      });
    }

    return this.transitionRun({
      executionRunId: params.executionRunId,
      toStatus: 'completed',
      completedAt: this.clock.now(),
      outcomeSummary,
      pipelineExecutionId: pipelineResult?.executionId,
    });
  }

  async failRun(params: {
    executionRunId: ExecutionRunId;
    failureCode: string;
    failureReason: string;
  }): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    return this.transitionRun({
      executionRunId: params.executionRunId,
      toStatus: 'failed',
      completedAt: this.clock.now(),
      failureCode: params.failureCode,
      failureReason: params.failureReason,
    });
  }

  async rejectRun(params: {
    executionRunId: ExecutionRunId;
    failureCode: string;
    failureReason: string;
  }): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    return this.transitionRun({
      executionRunId: params.executionRunId,
      toStatus: 'rejected',
      completedAt: this.clock.now(),
      failureCode: params.failureCode,
      failureReason: params.failureReason,
    });
  }

  async getAuditRecord(executionRunId: ExecutionRunId): Promise<ExecutionRunAuditRecord | null> {
    const run = await this.repository.findById(executionRunId);
    return run === null ? null : mapExecutionRunToAuditRecord(run);
  }

  async findRunByIdempotencyKey(idempotencyKey: IdempotencyKey): Promise<ExecutionRun | null> {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  createSafeFailureFromException(error: unknown): {
    failureCode: string;
    failureReason: string;
  } {
    return {
      failureCode: 'PROCESSING_EXCEPTION',
      failureReason: sanitizeUnexpectedErrorMessage(error),
    };
  }

  private async transitionRun(params: {
    executionRunId: ExecutionRunId;
    toStatus: ExecutionRun['status'];
    startedAt?: Date;
    completedAt?: Date;
    failureCode?: string;
    failureReason?: string;
    outcomeSummary?: ExecutionRun['outcomeSummary'];
    pipelineExecutionId?: string;
  }): Promise<Result<ExecutionRun, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(params.executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    if (isTerminalExecutionRunStatus(existing.status)) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${params.executionRunId}" is already terminal (${existing.status}).`,
          'TERMINAL_RUN',
        ),
      );
    }

    if (!canTransitionExecutionRunStatus(existing.status, params.toStatus)) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Invalid execution run transition from "${existing.status}" to "${params.toStatus}".`,
          'INVALID_TRANSITION',
        ),
      );
    }

    const updated = createExecutionRun({
      ...existing,
      status: params.toStatus,
      startedAt: params.startedAt ?? existing.startedAt,
      completedAt: params.completedAt ?? existing.completedAt,
      failureCode: params.failureCode ?? existing.failureCode,
      failureReason: params.failureReason ?? existing.failureReason,
      outcomeSummary: params.outcomeSummary ?? existing.outcomeSummary,
      pipelineExecutionId: params.pipelineExecutionId ?? existing.pipelineExecutionId,
    });

    const saveResult = await this.repository.save(updated);

    if (!saveResult.ok) {
      return Result.fail(
        new ExecutionRunLifecycleError(saveResult.error.message, saveResult.error.failureCode),
      );
    }

    return Result.ok(saveResult.value);
  }

  private async upsertStepProgress(
    executionRunId: ExecutionRunId,
    step: ExecutionRunStepProgress,
  ): Promise<Result<void, ExecutionRunLifecycleError>> {
    const existing = await this.repository.findById(executionRunId);

    if (existing === null) {
      return Result.fail(
        new ExecutionRunLifecycleError(
          `Execution run "${executionRunId}" was not found.`,
          'RUN_NOT_FOUND',
        ),
      );
    }

    const nextStep = createExecutionRunStepProgress(step);
    const remainingSteps = existing.stepProgress.filter(
      (currentStep) => currentStep.stepId !== nextStep.stepId,
    );
    const nextProgress = [...remainingSteps, nextStep].sort(
      (left, right) => left.executionOrder - right.executionOrder,
    );

    const updated = createExecutionRun({
      ...existing,
      stepProgress: nextProgress,
    });

    const saveResult = await this.repository.save(updated);

    if (!saveResult.ok) {
      return Result.fail(
        new ExecutionRunLifecycleError(saveResult.error.message, saveResult.error.failureCode),
      );
    }

    return Result.ok(undefined);
  }

  private extractValidationFailureCode(
    output: Readonly<Record<string, unknown>> | undefined,
  ): string | undefined {
    if (output === undefined) {
      return undefined;
    }

    const failureCode = output.failureCode;
    return typeof failureCode === 'string' ? failureCode : undefined;
  }
}
