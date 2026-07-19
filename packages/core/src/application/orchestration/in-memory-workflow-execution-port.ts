import type { WorkflowExecutionPort } from './workflow-execution-port.js';
import type { WorkflowExecutionRequest } from '../../domain/orchestration/workflow-execution-request.js';
import {
  createWorkflowExecutionOutcome,
  type WorkflowExecutionOutcome,
} from '../../domain/orchestration/workflow-execution-outcome.js';

const cloneRequest = (request: WorkflowExecutionRequest): WorkflowExecutionRequest => ({
  executionId: request.executionId,
  eventId: request.eventId,
  automationId: request.automationId,
  workflowId: request.workflowId,
  eventType: request.eventType,
  occurredAt: request.occurredAt,
  correlationId: request.correlationId,
  payload: { ...request.payload },
});

export type InMemoryWorkflowExecutionPortHandler = (
  request: WorkflowExecutionRequest,
  index: number,
) => WorkflowExecutionOutcome | Promise<WorkflowExecutionOutcome>;

/**
 * In-memory workflow execution port for tests and local composition.
 */
export class InMemoryWorkflowExecutionPort implements WorkflowExecutionPort {
  private readonly recordedRequests: WorkflowExecutionRequest[] = [];
  private handler: InMemoryWorkflowExecutionPortHandler = (_request, _index) =>
    createWorkflowExecutionOutcome({
      executionId: _request.executionId,
      automationId: _request.automationId,
      workflowId: _request.workflowId,
      status: 'succeeded',
    });
  private configuredError?: Error;

  configureHandler(handler: InMemoryWorkflowExecutionPortHandler): void {
    this.handler = handler;
  }

  configureError(error: Error): void {
    this.configuredError = error;
  }

  async execute(request: WorkflowExecutionRequest): Promise<WorkflowExecutionOutcome> {
    this.recordedRequests.push(cloneRequest(request));

    if (this.configuredError !== undefined) {
      throw this.configuredError;
    }

    const index = this.recordedRequests.length - 1;
    return this.handler(request, index);
  }

  getRecordedRequests(): readonly WorkflowExecutionRequest[] {
    return this.recordedRequests.map((request) => cloneRequest(request));
  }

  clear(): void {
    this.recordedRequests.length = 0;
    this.configuredError = undefined;
  }
}
