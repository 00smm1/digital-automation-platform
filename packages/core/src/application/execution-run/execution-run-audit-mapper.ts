import type { ExecutionRun } from '../../domain/execution-run/execution-run.js';
import {
  createExecutionRunAuditRecord,
  type ExecutionRunAuditRecord,
} from '../../domain/execution-run/execution-run-audit-record.js';

export const mapExecutionRunToAuditRecord = (run: ExecutionRun): ExecutionRunAuditRecord =>
  createExecutionRunAuditRecord({
    runId: run.id,
    sourceId: run.sourceId,
    externalEventId: run.externalEventId,
    externalOrderReference: run.externalOrderReference,
    status: run.status,
    matchedAutomations: run.matchedAutomationIds,
    workflows: run.workflowIds,
    stepSummaries: run.stepProgress.map((step) => ({
      stepId: step.stepId,
      stepName: step.stepName,
      executionOrder: step.executionOrder,
      status: step.status,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      failureCode: step.failureCode,
      failureReason: step.failureReason,
    })),
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failureCode: run.failureCode,
    failureMessage: run.failureReason,
    outcomeSummary: run.outcomeSummary,
  });
