import type { DigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { createDigitalFulfillmentResult } from '../../domain/fulfillment/digital-fulfillment-result.js';
import type { DigitalFulfillmentResult } from '../../domain/fulfillment/digital-fulfillment-result.js';
import type {
  InventoryFulfillmentOutcome,
  NotificationFulfillmentOutcome,
  ProvisioningFulfillmentOutcome,
} from '../../domain/fulfillment/fulfillment-outcomes.js';
import type { PlatformEventOrchestrationResult } from '../../domain/orchestration/platform-event-orchestration-result.js';
import type { PipelineExecutionResult } from '../../domain/workflow-pipeline/pipeline-execution-result.js';
import type { PipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from './fulfillment-pipeline-step-types.js';

const findStep = (
  pipelineResult: PipelineExecutionResult | undefined,
  stepType: string,
): PipelineStepExecutionResult | undefined => {
  if (pipelineResult === undefined) {
    return undefined;
  }

  const completed = pipelineResult.completedSteps.find((step) => step.stepType === stepType);
  if (completed !== undefined) {
    return completed;
  }

  return pipelineResult.failedStep?.stepType === stepType ? pipelineResult.failedStep : undefined;
};

const mapInventoryOutcome = (
  pipelineResult: PipelineExecutionResult | undefined,
): InventoryFulfillmentOutcome => {
  const step = findStep(pipelineResult, DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY);

  if (step === undefined) {
    return { status: 'notAttempted' };
  }

  if (step.status === 'failed') {
    return {
      status: 'failed',
      failureCode:
        typeof step.output?.failureCode === 'string' ? step.output.failureCode : undefined,
      failureReason: step.failureReason,
      productReference:
        typeof step.output?.productReference === 'string'
          ? step.output.productReference
          : undefined,
    };
  }

  const inventoryItemIds = Array.isArray(step.output?.inventoryItemIds)
    ? (step.output.inventoryItemIds as string[])
    : [];
  const consumeStep = findStep(
    pipelineResult,
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
  );
  const consumed = consumeStep?.status === 'succeeded';

  return {
    status: consumed ? 'consumed' : 'reserved',
    reservationReference:
      typeof step.output?.reservationReference === 'string'
        ? step.output.reservationReference
        : undefined,
    inventoryItemReference:
      typeof step.output?.inventoryItemReference === 'string'
        ? step.output.inventoryItemReference
        : undefined,
    inventoryItemId: inventoryItemIds[0],
    productReference:
      typeof step.output?.inventoryItemReference === 'string'
        ? step.output.inventoryItemReference
        : typeof step.output?.productReference === 'string'
          ? step.output.productReference
          : undefined,
    reservedQuantity:
      typeof step.output?.quantity === 'number'
        ? step.output.quantity
        : typeof step.output?.reservedQuantity === 'number'
          ? step.output.reservedQuantity
          : undefined,
    reservationStatus:
      typeof consumeStep?.output?.status === 'string'
        ? consumeStep.output.status
        : typeof step.output?.status === 'string'
          ? step.output.status
          : undefined,
  };
};

const mapProvisioningOutcome = (
  pipelineResult: PipelineExecutionResult | undefined,
): ProvisioningFulfillmentOutcome => {
  const step = findStep(
    pipelineResult,
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
  );

  if (step === undefined) {
    return { status: 'notAttempted' };
  }

  if (step.status === 'failed') {
    return {
      status: 'failed',
      failureCode:
        typeof step.output?.failureCode === 'string' ? step.output.failureCode : undefined,
      failureReason: step.failureReason,
    };
  }

  return {
    status: 'provisioned',
    providerReference:
      typeof step.output?.providerReference === 'string'
        ? step.output.providerReference
        : undefined,
    executionAttemptReference:
      typeof step.output?.executionAttemptReference === 'string'
        ? step.output.executionAttemptReference
        : undefined,
    externalProvisioningReference:
      typeof step.output?.externalProvisioningReference === 'string'
        ? step.output.externalProvisioningReference
        : undefined,
    deliveryMaterialReference:
      typeof step.output?.deliveryMaterialReference === 'string'
        ? step.output.deliveryMaterialReference
        : undefined,
  };
};

const mapNotificationOutcome = (
  pipelineResult: PipelineExecutionResult | undefined,
): NotificationFulfillmentOutcome => {
  const step = findStep(pipelineResult, DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER);

  if (step === undefined) {
    return { status: 'notAttempted' };
  }

  if (step.status === 'failed') {
    return {
      status: 'failed',
      failureCode:
        typeof step.output?.failureCode === 'string' ? step.output.failureCode : undefined,
      failureReason: step.failureReason,
    };
  }

  return {
    status: 'sent',
    channel: typeof step.output?.channel === 'string' ? step.output.channel : undefined,
    notificationReference:
      typeof step.output?.notificationReference === 'string'
        ? step.output.notificationReference
        : undefined,
  };
};

export const mapOrchestrationToFulfillmentResult = (params: {
  request: DigitalFulfillmentRequest;
  orchestrationResult: PlatformEventOrchestrationResult;
  startedAt: Date;
  completedAt: Date;
}): DigitalFulfillmentResult => {
  const durationMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime());
  const primaryOutcome = params.orchestrationResult.executionOutcomes[0];
  const pipelineResult = primaryOutcome?.pipelineExecutionResult;

  if (params.orchestrationResult.overallStatus === 'noMatch') {
    return createDigitalFulfillmentResult({
      executionId: params.request.eventId,
      eventId: params.request.eventId,
      externalOrderReference: params.request.externalOrderReference,
      status: 'failed',
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs,
      inventoryOutcome: { status: 'notAttempted' },
      provisioningOutcome: { status: 'notAttempted' },
      notificationOutcome: { status: 'notAttempted' },
      completedPipelineSteps: [],
      failureReason: 'No matching automation was found for the event.',
      failureCode: 'NO_MATCH',
    });
  }

  const inventoryOutcome = mapInventoryOutcome(pipelineResult);
  const provisioningOutcome = mapProvisioningOutcome(pipelineResult);
  const notificationOutcome = mapNotificationOutcome(pipelineResult);
  const completedPipelineSteps = pipelineResult?.completedSteps.map((step) => step.stepName) ?? [];

  let status: DigitalFulfillmentResult['status'] = 'failed';
  let failureReason = primaryOutcome?.failureReason;
  let failureCode: string | undefined;

  if (pipelineResult?.status === 'succeeded') {
    status = 'completed';
  } else if (
    pipelineResult?.failedStep?.stepType === DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.VALIDATE_ORDER
  ) {
    status = 'rejected';
    failureCode =
      typeof pipelineResult.failedStep.output?.failureCode === 'string'
        ? pipelineResult.failedStep.output.failureCode
        : 'VALIDATION_FAILED';
    failureReason = pipelineResult.failedStep.failureReason ?? failureReason;
  } else {
    failureCode =
      typeof pipelineResult?.failedStep?.output?.failureCode === 'string'
        ? pipelineResult.failedStep.output.failureCode
        : undefined;
  }

  return createDigitalFulfillmentResult({
    executionId: primaryOutcome?.executionId ?? params.request.eventId,
    eventId: params.request.eventId,
    externalOrderReference: params.request.externalOrderReference,
    status,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    durationMs,
    inventoryOutcome,
    provisioningOutcome,
    notificationOutcome,
    completedPipelineSteps,
    failedStep: pipelineResult?.failedStep?.stepName,
    failureReason,
    failureCode,
  });
};

export const mapValidationFailureToFulfillmentResult = (params: {
  request: DigitalFulfillmentRequest;
  failureReason: string;
  startedAt: Date;
  completedAt: Date;
}): DigitalFulfillmentResult => {
  const durationMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime());

  return createDigitalFulfillmentResult({
    executionId: params.request.eventId,
    eventId: params.request.eventId,
    externalOrderReference: params.request.externalOrderReference,
    status: 'rejected',
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    durationMs,
    inventoryOutcome: { status: 'notAttempted' },
    provisioningOutcome: { status: 'notAttempted' },
    notificationOutcome: { status: 'notAttempted' },
    completedPipelineSteps: [],
    failureReason: params.failureReason,
    failureCode: 'VALIDATION_FAILED',
  });
};
