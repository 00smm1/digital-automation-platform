import type { ExecutionRunId } from './execution-run-id.js';
import type { ExecutionRunStatus } from './execution-run-status.js';
import type { ExecutionRunStepProgress } from './execution-run-step-progress.js';
import type { ExecutionRunOutcomeSummary } from './execution-run-outcome-summary.js';

export type ExecutionRunStepSummary = {
  readonly stepId: string;
  readonly stepName: string;
  readonly executionOrder: number;
  readonly status: ExecutionRunStepProgress['status'];
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failureCode?: string;
  readonly failureReason?: string;
};

export type ExecutionRunAuditRecord = {
  readonly runId: ExecutionRunId;
  readonly sourceId: string;
  readonly externalEventId: string;
  readonly externalOrderReference?: string;
  readonly status: ExecutionRunStatus;
  readonly matchedAutomations: readonly string[];
  readonly workflows: readonly string[];
  readonly stepSummaries: readonly ExecutionRunStepSummary[];
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly outcomeSummary?: ExecutionRunOutcomeSummary;
};

export const createExecutionRunAuditRecord = (
  params: ExecutionRunAuditRecord,
): ExecutionRunAuditRecord => ({
  runId: params.runId,
  sourceId: params.sourceId,
  externalEventId: params.externalEventId,
  externalOrderReference: params.externalOrderReference,
  status: params.status,
  matchedAutomations: [...params.matchedAutomations],
  workflows: [...params.workflows],
  stepSummaries: params.stepSummaries.map((step) => ({ ...step })),
  createdAt: params.createdAt,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  failureCode: params.failureCode,
  failureMessage: params.failureMessage,
  outcomeSummary: params.outcomeSummary,
});
