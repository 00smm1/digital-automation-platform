import type { WorkflowExecutionOutcome } from './workflow-execution-outcome.js';

export const PLATFORM_EVENT_ORCHESTRATION_STATUSES = [
  'noMatch',
  'succeeded',
  'partiallySucceeded',
  'failed',
] as const;

export type PlatformEventOrchestrationStatus =
  (typeof PLATFORM_EVENT_ORCHESTRATION_STATUSES)[number];

/**
 * Aggregate result of processing one normalized platform event through orchestration.
 */
export type PlatformEventOrchestrationResult = {
  readonly eventId: string;
  readonly eventType: string;
  readonly matchedAutomationCount: number;
  readonly attemptedExecutionCount: number;
  readonly successfulExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly executionOutcomes: readonly WorkflowExecutionOutcome[];
  readonly overallStatus: PlatformEventOrchestrationStatus;
};

export const createPlatformEventOrchestrationResult = (params: {
  eventId: string;
  eventType: string;
  matchedAutomationCount: number;
  executionOutcomes: readonly WorkflowExecutionOutcome[];
}): PlatformEventOrchestrationResult => {
  const attemptedExecutionCount = params.executionOutcomes.length;
  const successfulExecutionCount = params.executionOutcomes.filter(
    (outcome) => outcome.status === 'succeeded',
  ).length;
  const failedExecutionCount = params.executionOutcomes.filter(
    (outcome) => outcome.status !== 'succeeded',
  ).length;

  let overallStatus: PlatformEventOrchestrationStatus;

  if (params.matchedAutomationCount === 0) {
    overallStatus = 'noMatch';
  } else if (attemptedExecutionCount === 0) {
    overallStatus = 'noMatch';
  } else if (failedExecutionCount === 0) {
    overallStatus = 'succeeded';
  } else if (successfulExecutionCount === 0) {
    overallStatus = 'failed';
  } else {
    overallStatus = 'partiallySucceeded';
  }

  return {
    eventId: params.eventId,
    eventType: params.eventType,
    matchedAutomationCount: params.matchedAutomationCount,
    attemptedExecutionCount,
    successfulExecutionCount,
    failedExecutionCount,
    executionOutcomes: params.executionOutcomes,
    overallStatus,
  };
};
