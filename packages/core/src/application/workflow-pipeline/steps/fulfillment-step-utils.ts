import type { PipelineStepExecutionContext } from '../../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { PipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { FulfillmentPipelineInput } from '../../fulfillment/fulfillment-event-mapper.js';

export const readFulfillmentPipelineInput = (
  context: PipelineStepExecutionContext,
): FulfillmentPipelineInput => {
  const input = context.input;

  return {
    eventId: String(input.eventId ?? ''),
    eventType: String(input.eventType ?? ''),
    externalOrderReference: String(input.externalOrderReference ?? ''),
    customerReference: String(input.customerReference ?? ''),
    customerEmail: input.customerEmail === undefined ? undefined : String(input.customerEmail),
    productReference: String(input.productReference ?? ''),
    quantity: Number(input.quantity ?? 0),
  };
};

export const findPriorStepOutput = (
  context: PipelineStepExecutionContext,
  stepType: string,
): PipelineStepExecutionResult | undefined => {
  return context.priorStepOutputs.find((output) => output.stepType === stepType);
};

export const createStepTimestamps = (): { startedAt: Date; completedAt: Date } => {
  const startedAt = new Date();
  return { startedAt, completedAt: startedAt };
};
