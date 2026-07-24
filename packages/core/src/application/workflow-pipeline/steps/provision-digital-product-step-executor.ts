import type { ProviderRuntimePort } from '@dap/provider-runtime';
import {
  createDigitalSubscriptionProvisioningParameters,
  projectProviderExecutionEvidenceForAudit,
} from '@dap/provider-runtime';
import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { InventoryReservationLifecyclePort } from '../../fulfillment/ports/inventory-reservation-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../../shared/time/clock.js';
import {
  attemptReservationReleaseSafely,
  createStepTimestamps,
  mapReleaseCleanupToFailureOutput,
  readExecutionRunReference,
  readFulfillmentPipelineInput,
  readValidatedReserveStepOutput,
} from './fulfillment-step-utils.js';

const mapRuntimeFailureToWorkflowCode = (runtimeKind: string, safeFailureCode: string): string => {
  switch (runtimeKind) {
    case 'invalid-provider-request':
      return 'INVALID_PROVIDER_REQUEST';
    case 'provider-selection-failed':
      return 'PROVIDER_SELECTION_FAILED';
    case 'provider-timeout':
      return 'PROVIDER_TIMEOUT';
    case 'provider-rejected':
      return 'PROVIDER_REJECTED';
    case 'provider-unavailable':
      return 'PROVIDER_UNAVAILABLE';
    case 'provider-exception':
      return 'PROVIDER_EXECUTION_FAILED';
    case 'credential-resolution-failed':
      return 'CREDENTIAL_RESOLUTION_FAILED';
    case 'invalid-provider-response':
      return 'INVALID_PROVIDER_RESPONSE';
    case 'runtime-failed':
      return 'PROVIDER_RUNTIME_FAILED';
    default:
      return safeFailureCode;
  }
};

const deriveDurationReference = (productReference: string): string =>
  `${productReference}-duration`;

export const createProvisionDigitalProductStepExecutor = (
  providerRuntimePort: ProviderRuntimePort,
  reservationLifecyclePort: InventoryReservationLifecyclePort,
  clock: Clock,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps(clock);
    const input = readFulfillmentPipelineInput(context);
    const reserveOutput = readValidatedReserveStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
    );

    if (!reserveOutput.ok) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Provisioning requires a valid inventory reservation.',
        output: {
          failureCode: reserveOutput.failureCode,
        },
      });
    }

    const executionRunReference = readExecutionRunReference(context);
    if (executionRunReference === undefined) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Provisioning requires a valid execution run reference.',
        output: {
          failureCode: 'missing-execution-run-reference',
        },
      });
    }

    const { reservationReference, inventoryItemReference, quantity } = reserveOutput.value;

    const handleProvisioningFailure = async (params: {
      provisioningFailureCode: string;
      provisioningFailureReason: string;
      retryClassification?: string;
    }) => {
      const cleanup = await attemptReservationReleaseSafely(
        reservationLifecyclePort,
        reservationReference,
      );

      if (cleanup.kind === 'released') {
        return createPipelineStepExecutionResult({
          stepId: step.id,
          stepName: step.name,
          stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
          status: 'failed',
          startedAt,
          completedAt,
          failureReason: params.provisioningFailureReason,
          output: {
            failureCode: params.provisioningFailureCode,
            retryClassification: params.retryClassification,
            reservationReference,
            inventoryItemReference,
            quantity,
            reservationReleased: true,
          },
        });
      }

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason:
          cleanup.kind === 'release-exception'
            ? 'Provisioning failed and reservation cleanup failed unexpectedly.'
            : 'Provisioning failed and reservation cleanup did not release inventory.',
        output: mapReleaseCleanupToFailureOutput(
          cleanup,
          params.provisioningFailureCode,
          reservationReference,
        ),
      });
    };

    const provisioningParametersResult = createDigitalSubscriptionProvisioningParameters({
      planReference: input.productReference,
      durationReference: deriveDurationReference(input.productReference),
    });

    if (!provisioningParametersResult.ok) {
      return handleProvisioningFailure({
        provisioningFailureCode: 'INVALID_PROVIDER_REQUEST',
        provisioningFailureReason: 'Provisioning parameters are invalid.',
        retryClassification: 'retry-not-safe',
      });
    }

    try {
      const runtimeResult = await providerRuntimePort.executeProvisioning({
        executionRunReference,
        externalOrderReference: input.externalOrderReference,
        reservationReference,
        inventoryItemReference,
        requiredCapability: 'digital-subscription-provisioning',
        quantity,
        fulfillmentDefinitionReference: input.productReference,
        provisioningParameters: provisioningParametersResult.value,
        correlationReference: input.eventId,
      });

      if (runtimeResult.kind !== 'provider-execution-succeeded') {
        return handleProvisioningFailure({
          provisioningFailureCode: mapRuntimeFailureToWorkflowCode(
            runtimeResult.kind,
            runtimeResult.safeFailureCode,
          ),
          provisioningFailureReason: 'Digital product provisioning failed.',
          retryClassification: runtimeResult.retryClassification,
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
          providerReference: String(runtimeResult.providerReference),
          executionAttemptReference: String(runtimeResult.executionAttemptReference),
          externalProvisioningReference: String(runtimeResult.externalProvisioningReference),
          deliveryMaterialReference:
            runtimeResult.deliveryMaterialReference === undefined
              ? undefined
              : String(runtimeResult.deliveryMaterialReference),
          capability: runtimeResult.capability,
          safeResultCode: runtimeResult.safeResultCode,
          retryClassification: runtimeResult.retryClassification,
          safeEvidence: projectProviderExecutionEvidenceForAudit(runtimeResult.safeEvidence),
          reservationReference,
          inventoryItemReference,
          quantity,
        },
      });
    } catch {
      return handleProvisioningFailure({
        provisioningFailureCode: 'PROVIDER_EXECUTION_FAILED',
        provisioningFailureReason: 'Digital product provisioning failed unexpectedly.',
        retryClassification: 'retry-after-reconciliation',
      });
    }
  };
};
