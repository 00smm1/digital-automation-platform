import type { Identifier } from '../../shared/types/identifier.js';
import type { NormalizedPlatformEventPayload } from '../automation-definition/normalized-platform-event.js';

export type WorkflowExecutionRequestId = Identifier<'WorkflowExecution'>;

/**
 * Provider-independent request to execute a matched automation workflow.
 */
export type WorkflowExecutionRequest = {
  readonly executionId: WorkflowExecutionRequestId;
  readonly eventId: string;
  readonly automationId: string;
  readonly workflowId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: NormalizedPlatformEventPayload;
};

export const createWorkflowExecutionRequest = (
  params: WorkflowExecutionRequest,
): WorkflowExecutionRequest => params;

export type WorkflowExecutionIdGeneratorParams = {
  readonly eventId: string;
  readonly automationId: string;
  readonly sequence: number;
};

export type WorkflowExecutionIdGenerator = (
  params: WorkflowExecutionIdGeneratorParams,
) => WorkflowExecutionRequestId;

export const createDefaultWorkflowExecutionIdGenerator = (): WorkflowExecutionIdGenerator => {
  return (params) =>
    `${params.eventId}:${params.automationId}:${params.sequence}` as WorkflowExecutionRequestId;
};
