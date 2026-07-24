import type { PipelineStepExecutionContext } from '../../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import type { PipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { FulfillmentPipelineInput } from '../../fulfillment/fulfillment-event-mapper.js';
import type { Clock } from '../../../shared/time/clock.js';
import { createPositiveInventoryQuantity } from '../../../domain/inventory/inventory-quantity.js';
import type { ReleaseReservationOutcome } from '../../inventory/reservation-results.js';
import type { InventoryReservationLifecyclePort } from '../../fulfillment/ports/inventory-reservation-port.js';

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

export const readExecutionRunReference = (
  context: PipelineStepExecutionContext,
): string | undefined => {
  const executionRunId = context.metadata.executionRunId;

  if (typeof executionRunId === 'string' && executionRunId.trim().length > 0) {
    return executionRunId;
  }

  if (context.runId.trim().length > 0) {
    return context.runId;
  }

  return undefined;
};

export const findPriorStepOutput = (
  context: PipelineStepExecutionContext,
  stepType: string,
): PipelineStepExecutionResult | undefined => {
  return context.priorStepOutputs.find((output) => output.stepType === stepType);
};

export const createStepTimestamps = (clock: Clock): { startedAt: Date; completedAt: Date } => {
  const startedAt = clock.now();

  return { startedAt, completedAt: new Date(startedAt.getTime()) };
};

export const readReservationReferenceFromReserveStep = (
  context: PipelineStepExecutionContext,
  reserveStepType: string,
): string | undefined => {
  const output = findPriorStepOutput(context, reserveStepType)?.output;
  const reservationReference = output?.reservationReference;

  return typeof reservationReference === 'string' && reservationReference.length > 0
    ? reservationReference
    : undefined;
};

export type ValidatedReserveStepOutput = {
  readonly reservationReference: string;
  readonly inventoryItemReference: string;
  readonly quantity: number;
};

export type ValidatedReserveStepOutputResult =
  | { readonly ok: true; readonly value: ValidatedReserveStepOutput }
  | { readonly ok: false; readonly failureCode: string };

export const readValidatedReserveStepOutput = (
  context: PipelineStepExecutionContext,
  reserveStepType: string,
): ValidatedReserveStepOutputResult => {
  const reserveStep = findPriorStepOutput(context, reserveStepType);

  if (reserveStep === undefined || reserveStep.status !== 'succeeded') {
    return { ok: false, failureCode: 'reserve-step-not-successful' };
  }

  const output = reserveStep.output;
  const reservationReference = output?.reservationReference;
  const inventoryItemReference = output?.inventoryItemReference;
  const quantity = output?.quantity;

  if (typeof reservationReference !== 'string' || reservationReference.trim().length === 0) {
    return { ok: false, failureCode: 'missing-reservation-reference' };
  }

  if (typeof inventoryItemReference !== 'string' || inventoryItemReference.trim().length === 0) {
    return { ok: false, failureCode: 'missing-inventory-item-reference' };
  }

  const quantityResult = createPositiveInventoryQuantity(quantity);

  if (!quantityResult.ok) {
    return { ok: false, failureCode: 'invalid-reserved-quantity' };
  }

  return {
    ok: true,
    value: {
      reservationReference,
      inventoryItemReference,
      quantity: quantityResult.value,
    },
  };
};

export const isReservationReleased = (outcome: ReleaseReservationOutcome): boolean => {
  if (outcome.kind === 'reservation-released') {
    return true;
  }

  return outcome.kind === 'reservation-already-terminal' && outcome.status === 'released';
};

export const readReleaseFailureCode = (outcome: ReleaseReservationOutcome): string => {
  switch (outcome.kind) {
    case 'reservation-released':
      return 'reservation-released';
    case 'reservation-already-terminal':
      return 'reservation-already-terminal';
    case 'reservation-not-found':
      return 'reservation-not-found';
    case 'reservation-transition-failed':
      return 'reservation-transition-failed';
    case 'repository-failed':
      return 'repository-failed';
    case 'partial-processing':
      return 'partial-processing';
    case 'invalid-reservation-reference':
      return 'invalid-reservation-reference';
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
};

export const createProvisioningCleanupFailureOutput = (params: {
  readonly provisioningFailureCode: string;
  readonly releaseFailureCode: string;
  readonly releaseReasonCode?: string;
  readonly reservationReference: string;
}): Record<string, string | boolean | undefined> => ({
  failureCode: 'partial-processing',
  provisioningFailureCode: params.provisioningFailureCode,
  releaseFailureCode: params.releaseFailureCode,
  releaseReasonCode: params.releaseReasonCode,
  reservationReference: params.reservationReference,
  reservationReleased: false,
});

export type SafeReservationReleaseCleanupOutcome =
  | {
      readonly kind: 'released';
      readonly outcome: ReleaseReservationOutcome;
    }
  | {
      readonly kind: 'cleanup-failed';
      readonly releaseFailureCode: string;
      readonly releaseReasonCode?: string;
      readonly outcome: ReleaseReservationOutcome;
    }
  | {
      readonly kind: 'release-exception';
      readonly releaseFailureCode: 'release-exception';
    };

export const attemptReservationReleaseSafely = async (
  reservationLifecyclePort: InventoryReservationLifecyclePort,
  reservationReference: string,
): Promise<SafeReservationReleaseCleanupOutcome> => {
  try {
    const outcome = await reservationLifecyclePort.releaseReservation(reservationReference);

    if (isReservationReleased(outcome)) {
      return { kind: 'released', outcome };
    }

    return {
      kind: 'cleanup-failed',
      releaseFailureCode: readReleaseFailureCode(outcome),
      releaseReasonCode: 'reasonCode' in outcome ? outcome.reasonCode : undefined,
      outcome,
    };
  } catch {
    return { kind: 'release-exception', releaseFailureCode: 'release-exception' };
  }
};

export const mapReleaseCleanupToFailureOutput = (
  cleanup: Exclude<SafeReservationReleaseCleanupOutcome, { kind: 'released' }>,
  provisioningFailureCode: string,
  reservationReference: string,
): Record<string, string | boolean | undefined> => {
  if (cleanup.kind === 'release-exception') {
    return createProvisioningCleanupFailureOutput({
      provisioningFailureCode,
      releaseFailureCode: cleanup.releaseFailureCode,
      reservationReference,
    });
  }

  return createProvisioningCleanupFailureOutput({
    provisioningFailureCode,
    releaseFailureCode: cleanup.releaseFailureCode,
    releaseReasonCode: cleanup.releaseReasonCode,
    reservationReference,
  });
};
