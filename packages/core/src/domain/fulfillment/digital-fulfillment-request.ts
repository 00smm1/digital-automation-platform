/**
 * Provider-neutral fulfillment request derived from a normalized order event.
 */
export type DigitalFulfillmentRequest = {
  readonly eventId: string;
  readonly eventType: string;
  readonly externalOrderReference: string;
  readonly customerReference: string;
  readonly customerEmail?: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly occurredAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export const createDigitalFulfillmentRequest = (
  params: DigitalFulfillmentRequest,
): DigitalFulfillmentRequest => ({
  eventId: params.eventId,
  eventType: params.eventType,
  externalOrderReference: params.externalOrderReference,
  customerReference: params.customerReference,
  customerEmail: params.customerEmail,
  productReference: params.productReference,
  quantity: params.quantity,
  occurredAt: params.occurredAt,
  metadata: { ...params.metadata },
});
