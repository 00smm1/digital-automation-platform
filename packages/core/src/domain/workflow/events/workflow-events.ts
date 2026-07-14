import { createEventName } from '../../events/event-name.js';
import type { DomainEvent } from '../../events/domain-event.js';
import type { WorkflowExecutionResult } from '../workflow-execution-result.js';
import type { WorkflowStepExecution } from '../workflow-step-execution.js';

export const WorkflowStartedEventName = createEventName('workflow.started');
export const WorkflowStepStartedEventName = createEventName('workflow.step.started');
export const WorkflowStepCompletedEventName = createEventName('workflow.step.completed');
export const WorkflowStepFailedEventName = createEventName('workflow.step.failed');
export const WorkflowCompletedEventName = createEventName('workflow.completed');
export const WorkflowFailedEventName = createEventName('workflow.failed');
export const WorkflowCancelledEventName = createEventName('workflow.cancelled');

export type WorkflowStartedEvent = DomainEvent<typeof WorkflowStartedEventName> & {
  readonly executionId: string;
  readonly workflowId: string;
  readonly runId: string;
};

export type WorkflowStepStartedEvent = DomainEvent<typeof WorkflowStepStartedEventName> & {
  readonly executionId: string;
  readonly stepExecution: WorkflowStepExecution;
};

export type WorkflowStepCompletedEvent = DomainEvent<typeof WorkflowStepCompletedEventName> & {
  readonly executionId: string;
  readonly stepExecution: WorkflowStepExecution;
};

export type WorkflowStepFailedEvent = DomainEvent<typeof WorkflowStepFailedEventName> & {
  readonly executionId: string;
  readonly stepExecution: WorkflowStepExecution;
};

export type WorkflowCompletedEvent = DomainEvent<typeof WorkflowCompletedEventName> & {
  readonly result: WorkflowExecutionResult;
};

export type WorkflowFailedEvent = DomainEvent<typeof WorkflowFailedEventName> & {
  readonly result: WorkflowExecutionResult;
};

export type WorkflowCancelledEvent = DomainEvent<typeof WorkflowCancelledEventName> & {
  readonly result: WorkflowExecutionResult;
};

export const createWorkflowStartedEvent = (params: {
  executionId: string;
  workflowId: string;
  runId: string;
  occurredAt?: Date;
}): WorkflowStartedEvent => ({
  eventId: `${params.executionId}:started`,
  occurredAt: params.occurredAt ?? new Date(),
  aggregateId: params.executionId,
  eventName: WorkflowStartedEventName,
  executionId: params.executionId,
  workflowId: params.workflowId,
  runId: params.runId,
});

export const createWorkflowStepStartedEvent = (params: {
  executionId: string;
  stepExecution: WorkflowStepExecution;
  occurredAt?: Date;
}): WorkflowStepStartedEvent => ({
  eventId: `${params.executionId}:${params.stepExecution.stepId}:started`,
  occurredAt: params.occurredAt ?? new Date(),
  aggregateId: params.executionId,
  eventName: WorkflowStepStartedEventName,
  executionId: params.executionId,
  stepExecution: params.stepExecution,
});

export const createWorkflowStepCompletedEvent = (params: {
  executionId: string;
  stepExecution: WorkflowStepExecution;
  occurredAt?: Date;
}): WorkflowStepCompletedEvent => ({
  eventId: `${params.executionId}:${params.stepExecution.stepId}:completed`,
  occurredAt: params.occurredAt ?? new Date(),
  aggregateId: params.executionId,
  eventName: WorkflowStepCompletedEventName,
  executionId: params.executionId,
  stepExecution: params.stepExecution,
});

export const createWorkflowStepFailedEvent = (params: {
  executionId: string;
  stepExecution: WorkflowStepExecution;
  occurredAt?: Date;
}): WorkflowStepFailedEvent => ({
  eventId: `${params.executionId}:${params.stepExecution.stepId}:failed`,
  occurredAt: params.occurredAt ?? new Date(),
  aggregateId: params.executionId,
  eventName: WorkflowStepFailedEventName,
  executionId: params.executionId,
  stepExecution: params.stepExecution,
});

export const createWorkflowCompletedEvent = (
  result: WorkflowExecutionResult,
): WorkflowCompletedEvent => ({
  eventId: `${result.executionId}:completed`,
  occurredAt: result.completedAt,
  aggregateId: result.executionId,
  eventName: WorkflowCompletedEventName,
  result,
});

export const createWorkflowFailedEvent = (
  result: WorkflowExecutionResult,
): WorkflowFailedEvent => ({
  eventId: `${result.executionId}:failed`,
  occurredAt: result.completedAt,
  aggregateId: result.executionId,
  eventName: WorkflowFailedEventName,
  result,
});

export const createWorkflowCancelledEvent = (
  result: WorkflowExecutionResult,
): WorkflowCancelledEvent => ({
  eventId: `${result.executionId}:cancelled`,
  occurredAt: result.completedAt,
  aggregateId: result.executionId,
  eventName: WorkflowCancelledEventName,
  result,
});
