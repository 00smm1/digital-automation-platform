import { createDigitalProductProvisioningRequest } from '../../../domain/provisioning/digital-product-provisioning.js';
import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { DigitalProductProvisioningPort } from '../../fulfillment/ports/digital-product-provisioning-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import {
  createStepTimestamps,
  findPriorStepOutput,
  readFulfillmentPipelineInput,
} from './fulfillment-step-utils.js';

export const createProvisionDigitalProductStepExecutor = (
  provisioningPort: DigitalProductProvisioningPort,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps();
    const input = readFulfillmentPipelineInput(context);
    const reservationOutput = findPriorStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
    )?.output;
    const inventoryItemIds = Array.isArray(reservationOutput?.inventoryItemIds)
      ? (reservationOutput.inventoryItemIds as string[])
      : [];
    const inventoryItemId = inventoryItemIds[0];

    try {
      const provisionResult = await provisioningPort.provision(
        createDigitalProductProvisioningRequest({
          orderReference: input.externalOrderReference,
          customerReference: input.customerReference,
          productReference: input.productReference,
          quantity: input.quantity,
          inventoryItemId,
          metadata: context.metadata,
        }),
      );

      if (!provisionResult.ok) {
        return createPipelineStepExecutionResult({
          stepId: step.id,
          stepName: step.name,
          stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
          status: 'failed',
          startedAt,
          completedAt,
          failureReason: provisionResult.error.message,
          output: {
            failureCode: provisionResult.error.failureCode,
          },
        });
      }

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        status: 'succeeded',
        startedAt,
        completedAt,
        output: {
          providerReference: provisionResult.value.providerReference,
          delivery: provisionResult.value.delivery,
        },
      });
    } catch (error: unknown) {
      const failureReason = error instanceof Error ? error.message : 'Provisioning failed.';

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason,
        output: { failureCode: 'PROVISIONING_EXCEPTION' },
      });
    }
  };
};
