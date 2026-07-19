import type { DigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { createNormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';

export const mapFulfillmentRequestToPlatformEvent = (
  request: DigitalFulfillmentRequest,
): NormalizedPlatformEvent =>
  createNormalizedPlatformEvent({
    eventId: request.eventId,
    eventType: request.eventType,
    occurredAt: request.occurredAt,
    payload: {
      order: {
        id: request.externalOrderReference,
        status: 'paid',
      },
      customer: {
        id: request.customerReference,
        email: request.customerEmail,
      },
      product: {
        reference: request.productReference,
        quantity: request.quantity,
      },
      metadata: request.metadata,
    },
  });

export type FulfillmentPipelineInput = {
  readonly eventId: string;
  readonly eventType: string;
  readonly externalOrderReference: string;
  readonly customerReference: string;
  readonly customerEmail?: string;
  readonly productReference: string;
  readonly quantity: number;
};

export const mapFulfillmentRequestToPipelineInput = (
  request: DigitalFulfillmentRequest,
): FulfillmentPipelineInput => ({
  eventId: request.eventId,
  eventType: request.eventType,
  externalOrderReference: request.externalOrderReference,
  customerReference: request.customerReference,
  customerEmail: request.customerEmail,
  productReference: request.productReference,
  quantity: request.quantity,
});
