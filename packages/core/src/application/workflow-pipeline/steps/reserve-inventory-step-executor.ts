import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { InventoryReservationPort } from '../../fulfillment/ports/inventory-reservation-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import { createStepTimestamps, readFulfillmentPipelineInput } from './fulfillment-step-utils.js';

export const createReserveInventoryStepExecutor = (
  inventoryReservationPort: InventoryReservationPort,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps();
    const input = readFulfillmentPipelineInput(context);

    const reservationResult = await inventoryReservationPort.reserve({
      productReference: input.productReference,
      orderItemReference: input.externalOrderReference,
      quantity: input.quantity,
    });

    if (!reservationResult.ok) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: reservationResult.error.message,
        output: {
          failureCode: reservationResult.error.code,
          productReference: input.productReference,
        },
      });
    }

    return createPipelineStepExecutionResult({
      stepId: step.id,
      stepName: step.name,
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
      status: 'succeeded',
      startedAt,
      completedAt,
      output: {
        inventoryItemIds: reservationResult.value.inventoryItemIds,
        productReference: reservationResult.value.productReference,
        reservedQuantity: reservationResult.value.reservedQuantity,
      },
    });
  };
};
