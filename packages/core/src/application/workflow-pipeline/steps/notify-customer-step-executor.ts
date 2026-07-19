import { formatProvisioningDeliveryForDisplay } from '../../../domain/fulfillment/provisioning-delivery.js';
import { createCustomerNotificationRequest } from '../../../domain/notification/customer-notification.js';
import { createPipelineStepExecutionResult } from '../../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import type { PipelineStepExecutor } from '../pipeline-step-executor.js';
import type { CustomerNotificationPort } from '../../fulfillment/ports/customer-notification-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../../fulfillment/fulfillment-pipeline-step-types.js';
import {
  createStepTimestamps,
  findPriorStepOutput,
  readFulfillmentPipelineInput,
} from './fulfillment-step-utils.js';
import type { ProvisioningDelivery } from '../../../domain/fulfillment/provisioning-delivery.js';

export const createNotifyCustomerStepExecutor = (
  notificationPort: CustomerNotificationPort,
): PipelineStepExecutor => {
  return async (context, step) => {
    const { startedAt, completedAt } = createStepTimestamps();
    const input = readFulfillmentPipelineInput(context);
    const provisionOutput = findPriorStepOutput(
      context,
      DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
    )?.output;
    const delivery = provisionOutput?.delivery as ProvisioningDelivery | undefined;
    const recipient = input.customerEmail ?? `${input.customerReference}@example.com`;

    const notificationResult = await notificationPort.notify(
      createCustomerNotificationRequest({
        customerReference: input.customerReference,
        recipient,
        channel: 'email',
        subject: 'Your digital product is ready',
        body: delivery
          ? `Your order ${input.externalOrderReference} is ready.\n${formatProvisioningDeliveryForDisplay(delivery)}`
          : `Your order ${input.externalOrderReference} is ready.`,
        orderReference: input.externalOrderReference,
        metadata: {
          eventId: input.eventId,
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
      },
    });
  };
};
