import type { WorkflowExecutionRequest } from '../../domain/orchestration/workflow-execution-request.js';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { PipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { FulfillmentPipelineInput } from '../fulfillment/fulfillment-event-mapper.js';
import { mapFulfillmentRequestToPipelineInput } from '../fulfillment/fulfillment-event-mapper.js';
import { createDigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';

export const mapWorkflowExecutionRequestToPipelineContext = (
  request: WorkflowExecutionRequest,
): PipelineStepExecutionContext => {
  const payload = request.payload;
  const order = (payload.order ?? {}) as Record<string, unknown>;
  const customer = (payload.customer ?? {}) as Record<string, unknown>;
  const product = (payload.product ?? {}) as Record<string, unknown>;
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;

  const fulfillmentInput: FulfillmentPipelineInput = {
    eventId: request.eventId,
    eventType: request.eventType,
    externalOrderReference: String(order.id ?? ''),
    customerReference: String(customer.id ?? ''),
    customerEmail: customer.email === undefined ? undefined : String(customer.email),
    productReference: String(product.reference ?? product.type ?? ''),
    quantity: Number(product.quantity ?? 1),
  };

  return createPipelineStepExecutionContext({
    executionId: request.executionId,
    workflowDefinitionId: request.workflowId,
    runId: request.correlationId,
    input: fulfillmentInput,
    metadata: {
      ...metadata,
      occurredAt: request.occurredAt.toISOString(),
      automationId: request.automationId,
      ...(request.executionRunId === undefined ? {} : { executionRunId: request.executionRunId }),
    },
    priorStepOutputs: [],
  });
};

export const createPipelineContextFromFulfillmentRequest = (params: {
  executionId: string;
  workflowDefinitionId: string;
  runId: string;
  request: ReturnType<typeof createDigitalFulfillmentRequest>;
}): PipelineStepExecutionContext =>
  createPipelineStepExecutionContext({
    executionId: params.executionId,
    workflowDefinitionId: params.workflowDefinitionId,
    runId: params.runId,
    input: mapFulfillmentRequestToPipelineInput(params.request),
    metadata: {
      ...params.request.metadata,
      occurredAt: params.request.occurredAt.toISOString(),
    },
    priorStepOutputs: [],
  });
