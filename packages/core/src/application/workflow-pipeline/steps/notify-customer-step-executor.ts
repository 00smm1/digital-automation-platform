import { createCustomerNotificationRequest } from '../../../domain/notification/customer-notification.js';
import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { CustomerNotificationPort } from '../../fulfillment/ports/customer-notification-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../../shared/time/clock.js';
import {
  createStepTimestamps,
  findPriorStepOutput,
  readFulfillmentPipelineInput,
} from './fulfillment-step-utils.js';

export const createNotifyCustomerStepExecutor = (
  notificationPort: CustomerNotificationPort,
  clock: Clock,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps(clock);
    const input = readFulfillmentPipelineInput(context);
    const consumeStep = findPriorStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
    );

    if (consumeStep === undefined || consumeStep.status !== 'succeeded') {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: 'Notification requires successful reservation consumption.',
        output: {
          failureCode: 'reservation-not-consumed',
        },
      });
    }

    const consumeOutput = consumeStep.output;
    const provisionOutput = findPriorStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
    )?.output;
    const deliveryMaterialReference =
      typeof provisionOutput?.deliveryMaterialReference === 'string'
        ? provisionOutput.deliveryMaterialReference
        : undefined;
    const externalProvisioningReference =
      typeof provisionOutput?.externalProvisioningReference === 'string'
        ? provisionOutput.externalProvisioningReference
        : undefined;
    const recipient = input.customerEmail ?? `${input.customerReference}@example.com`;

    const notificationResult = await notificationPort.notify(
      createCustomerNotificationRequest({
        customerReference: input.customerReference,
        recipient,
        channel: 'email',
        subject: 'Your digital product is ready',
        body:
          deliveryMaterialReference !== undefined
            ? `Your order ${input.externalOrderReference} is ready. Delivery reference: ${deliveryMaterialReference}`
            : externalProvisioningReference !== undefined
              ? `Your order ${input.externalOrderReference} is ready. Provisioning reference: ${externalProvisioningReference}`
              : `Your order ${input.externalOrderReference} is ready.`,
        orderReference: input.externalOrderReference,
        metadata: {
          eventId: input.eventId,
          reservationReference:
            typeof consumeOutput?.reservationReference === 'string'
              ? consumeOutput.reservationReference
              : undefined,
          deliveryMaterialReference,
          externalProvisioningReference,
        },
      }),
    );

    if (!notificationResult.ok) {
      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason: notificationResult.error.message,
        output: {
          failureCode: notificationResult.error.failureCode,
          reservationReference: consumeOutput?.reservationReference,
          reservationStatus: consumeOutput?.status,
        },
      });
    }

    return createPipelineStepExecutionResult({
      stepId: step.id,
      stepName: step.name,
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER,
      status: 'succeeded',
      startedAt,
      completedAt,
      output: {
        notificationReference: notificationResult.value.notificationReference,
        channel: notificationResult.value.channel,
        reservationReference: consumeOutput?.reservationReference,
        deliveryMaterialReference,
        externalProvisioningReference,
      },
    });
  };
};
