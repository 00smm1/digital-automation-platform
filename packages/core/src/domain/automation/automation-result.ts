import type { ExecutionLog } from './execution-log.js';

export type AutomationResultStatus = 'success' | 'failed';

/**
 * Final outcome of an automation execution.
 */
export type AutomationResult = {
  readonly runId: string;
  readonly automationId: string;
  readonly pipelineId: string;
  readonly status: AutomationResultStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly log: ExecutionLog;
  readonly failureReason?: string;
};

export const createAutomationResult = (params: {
  runId: string;
  automationId: string;
  pipelineId: string;
  status: AutomationResultStatus;
  startedAt: Date;
  completedAt: Date;
  log: ExecutionLog;
  failureReason?: string;
}): AutomationResult => ({
  runId: params.runId,
  automationId: params.automationId,
  pipelineId: params.pipelineId,
  status: params.status,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  log: params.log,
  failureReason: params.failureReason,
});
