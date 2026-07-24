import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { InventoryReservationLifecyclePort } from '../../fulfillment/ports/inventory-reservation-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../../shared/time/clock.js';
import {
  createStepTimestamps,
  findPriorStepOutput,
  readReservationReferenceFromReserveStep,
} from './fulfillment-step-utils.js';

export const createConsumeReservationStepExecutor = (
  reservationLifecyclePort: InventoryReservationLifecyclePort,
  clock: Clock,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps(clock);
    const provisionStep = findPriorStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
    );

    if (provisionStep === undefined || provisionStep.status !== 'succeeded') {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Consumption requires successful provisioning.',
        output: {
          failureCode: 'provisioning-not-successful',
        },
      });
    }

    const reservationReference =
      (typeof provisionStep.output?.reservationReference === 'string'
        ? provisionStep.output.reservationReference
        : undefined) ??
      readReservationReferenceFromReserveStep(
        context,
        DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
      );

    if (reservationReference === undefined) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Reservation reference is required for consumption.',
        output: {
          failureCode: 'missing-reservation-reference',
        },
      });
    }

    const consumeOutcome = await reservationLifecyclePort.consumeReservation(reservationReference);

    if (consumeOutcome.kind === 'partial-processing') {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Reservation consumption failed after successful provisioning.',
        output: {
          failureCode: 'partial-processing',
          reasonCode: consumeOutcome.reasonCode,
          reservationReference,
          inventoryItemReference: consumeOutcome.inventoryItemReference,
          quantity: consumeOutcome.quantity,
          status: consumeOutcome.status,
        },
      });
    }

    if (consumeOutcome.kind !== 'reservation-consumed') {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Reservation consumption failed.',
        output: {
          failureCode: consumeOutcome.kind,
          reservationReference,
        },
      });
    }

    return createPipelineStepExecutionResult({
      stepId: step.id,
      stepName: step.name,
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
      status: 'succeeded',
      startedAt,
      completedAt,
      output: {
        reservationReference: consumeOutcome.reservationReference,
        inventoryItemReference: consumeOutcome.inventoryItemReference,
        quantity: consumeOutcome.quantity,
        status: consumeOutcome.status,
        consumedAt: consumeOutcome.consumedAt.toISOString(),
      },
    });
  };
};
