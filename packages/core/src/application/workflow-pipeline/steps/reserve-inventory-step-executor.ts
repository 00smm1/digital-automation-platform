import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { InventoryReservationPort } from '../../fulfillment/ports/inventory-reservation-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../../shared/time/clock.js';
import {
  createStepTimestamps,
  readFulfillmentPipelineInput,
  readExecutionRunReference,
} from './fulfillment-step-utils.js';

export const createReserveInventoryStepExecutor = (
  inventoryReservationPort: InventoryReservationPort,
  clock: Clock,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps(clock);
    const input = readFulfillmentPipelineInput(context);
    const ownerReference = readExecutionRunReference(context);

    if (ownerReference === undefined) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Execution run reference is required for inventory reservation.',
        output: {
          failureCode: 'missing-execution-run-reference',
        },
      });
    }

    const reservationResult = await inventoryReservationPort.reserve({
      inventoryItemReference: input.productReference,
      ownerReference,
      quantity: input.quantity,
      externalOrderReference: input.externalOrderReference,
    });

    if (
      reservationResult.kind !== 'reservation-created' &&
      reservationResult.kind !== 'reservation-duplicate'
    ) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Inventory reservation failed.',
        output: {
          failureCode: reservationResult.kind,
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
        reservationReference: reservationResult.reservationReference,
        inventoryItemReference: reservationResult.inventoryItemReference,
        quantity: reservationResult.quantity,
        status: reservationResult.status,
        expiresAt: reservationResult.expiresAt.toISOString(),
      },
    });
  };
};
