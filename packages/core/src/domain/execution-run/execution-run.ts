import type { ExecutionRunId } from './execution-run-id.js';
import type { ExecutionRunStatus } from './execution-run-status.js';
import type { ExecutionRunStepProgress } from './execution-run-step-progress.js';
import type { ExecutionRunOutcomeSummary } from './execution-run-outcome-summary.js';
import type { IdempotencyKey } from '../inbound-event/idempotency-key.js';

export type ExecutionRun = {
  readonly id: ExecutionRunId;
  readonly sourceId: string;
  readonly externalEventId: string;
  readonly normalizedEventId: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly externalOrderReference?: string;
  readonly status: ExecutionRunStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly matchedAutomationIds: readonly string[];
  readonly workflowIds: readonly string[];
  readonly pipelineExecutionId?: string;
  readonly stepProgress: readonly ExecutionRunStepProgress[];
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly outcomeSummary?: ExecutionRunOutcomeSummary;
};

export const createExecutionRun = (params: ExecutionRun): ExecutionRun => ({
  id: params.id,
  sourceId: params.sourceId,
  externalEventId: params.externalEventId,
  normalizedEventId: params.normalizedEventId,
  idempotencyKey: params.idempotencyKey,
  externalOrderReference: params.externalOrderReference,
  status: params.status,
  createdAt: params.createdAt,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  matchedAutomationIds: [...params.matchedAutomationIds],
  workflowIds: [...params.workflowIds],
  pipelineExecutionId: params.pipelineExecutionId,
  stepProgress: params.stepProgress.map((step) => ({
    ...step,
    safeOutcomeMetadata:
      step.safeOutcomeMetadata === undefined ? undefined : { ...step.safeOutcomeMetadata },
  })),
  failureCode: params.failureCode,
  failureReason: params.failureReason,
  outcomeSummary: params.outcomeSummary,
});
