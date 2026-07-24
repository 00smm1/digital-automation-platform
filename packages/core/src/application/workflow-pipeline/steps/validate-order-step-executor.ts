import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import { FulfillmentRequestValidator } from '../../fulfillment/fulfillment-request-validator.js';
import { createDigitalFulfillmentRequest } from '../../../domain/fulfillment/digital-fulfillment-request.js';
import { FulfillmentValidationError } from '../../../domain/fulfillment/errors/fulfillment-errors.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../../shared/time/clock.js';
import { createStepTimestamps, readFulfillmentPipelineInput } from './fulfillment-step-utils.js';

const validator = new FulfillmentRequestValidator();

export const createValidateOrderStepExecutor = (clock: Clock): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps(clock);
    const input = readFulfillmentPipelineInput(context);

    try {
      validator.validate(
        createDigitalFulfillmentRequest({
          eventId: input.eventId,
          eventType: input.eventType,
          externalOrderReference: input.externalOrderReference,
          customerReference: input.customerReference,
          customerEmail: input.customerEmail,
          productReference: input.productReference,
          quantity: input.quantity,
          occurredAt: clock.now(),
          metadata: context.metadata,
        }),
      );

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.VALIDATE_ORDER,
        status: 'succeeded',
        startedAt,
        completedAt,
        output: { validated: true },
      });
    } catch (error: unknown) {
      const failureReason =
        error instanceof FulfillmentValidationError ? error.message : 'Order validation failed.';

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.VALIDATE_ORDER,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason,
        output: { failureCode: 'VALIDATION_FAILED' },
      });
    }
  };
};
