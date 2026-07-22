import { Result, createExternalEventEnvelope, createNormalizedPlatformEvent } from '@dap/core';
import type { ExternalEventEnvelope } from '@dap/core';
import type { InboundEventAdapter } from '@dap/core';
import { InboundEventNormalizationError } from '@dap/core';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import {
  createPaymentAuthorizedFulfillmentEvent,
  type PaymentAuthorizedFulfillmentEvent,
} from './payment-authorized-fulfillment-event.js';
import { cloneDate } from '../domain/immutability.js';
import type { CommerceOrderRecord } from '../domain/commerce-order-record.js';

const isSafeMetadata = (value: unknown): value is PaymentAuthorizedFulfillmentEvent['metadata'] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean' ||
      entry === null,
  );
};

const parseNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseCommerceOrder = (value: unknown): CommerceOrderRecord | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const order = value as CommerceOrderRecord;
  const externalOrderReference = parseNonEmptyString(order.externalOrderReference);
  const productReference = parseNonEmptyString(order.productReference);
  const customerReference = parseNonEmptyString(order.customerReference);

  if (
    externalOrderReference === undefined ||
    productReference === undefined ||
    customerReference === undefined ||
    typeof order.quantity !== 'number' ||
    !Number.isInteger(order.quantity) ||
    order.quantity <= 0 ||
    (order.customerEmail !== undefined && typeof order.customerEmail !== 'string') ||
    (order.orderStatus !== undefined && typeof order.orderStatus !== 'string')
  ) {
    return undefined;
  }

  return {
    externalOrderReference,
    productReference,
    quantity: order.quantity,
    customerReference,
    customerEmail: order.customerEmail,
    expectedAmount: order.expectedAmount,
    orderStatus: order.orderStatus,
  };
};

const validatePaymentAuthorizedFulfillmentEvent = (
  payload: unknown,
): Result<PaymentAuthorizedFulfillmentEvent, InboundEventNormalizationError> => {
  if (typeof payload !== 'object' || payload === null) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload is malformed.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const raw = payload as Record<string, unknown>;
  const paymentReferenceValue = parseNonEmptyString(raw.paymentReference);

  if (paymentReferenceValue === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload is missing payment reference.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const paymentReference = createPaymentReference(paymentReferenceValue);

  if (paymentReference === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload has an invalid payment reference.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const paymentSourceValue = parseNonEmptyString(raw.paymentSource);

  if (paymentSourceValue === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload is missing payment source.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const paymentSource = createPaymentSource(paymentSourceValue);

  if (paymentSource === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload has an invalid payment source.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const externalOrderReference = parseNonEmptyString(raw.externalOrderReference);

  if (externalOrderReference === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload is missing external order reference.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  if (raw.paymentStatus !== 'confirmed') {
    return Result.fail(
      new InboundEventNormalizationError(
        'Only confirmed payments may authorize fulfillment.',
        'AUTHORIZATION_REJECTED',
      ),
    );
  }

  if (!(raw.occurredAt instanceof Date) || Number.isNaN(raw.occurredAt.getTime())) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload has an invalid occurredAt value.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  const commerceOrder = parseCommerceOrder(raw.commerceOrder);

  if (commerceOrder === undefined) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload has an invalid commerce order.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  if (externalOrderReference !== commerceOrder.externalOrderReference) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment external order reference does not match the correlated commerce order.',
        'CORRELATION_FAILED',
      ),
    );
  }

  if (!isSafeMetadata(raw.metadata)) {
    return Result.fail(
      new InboundEventNormalizationError(
        'Payment authorized fulfillment payload has invalid metadata.',
        'MALFORMED_PAYLOAD',
      ),
    );
  }

  return Result.ok(
    createPaymentAuthorizedFulfillmentEvent({
      paymentReference,
      externalOrderReference,
      paymentSource,
      paymentStatus: 'confirmed',
      occurredAt: raw.occurredAt,
      commerceOrder,
      metadata: raw.metadata,
    }),
  );
};

export class PaymentConfirmationInboundAdapter implements InboundEventAdapter {
  async normalize(envelope: ExternalEventEnvelope) {
    const validation = validatePaymentAuthorizedFulfillmentEvent(envelope.payload);

    if (!validation.ok) {
      return Result.fail(validation.error);
    }

    const event = validation.value;
    const platformEventId = `${envelope.sourceId}:${envelope.externalEventId}`;

    return Result.ok(
      createNormalizedPlatformEvent({
        eventId: platformEventId,
        eventType: 'order.paid',
        occurredAt: cloneDate(event.occurredAt),
        payload: {
          order: {
            id: event.commerceOrder.externalOrderReference,
            status: 'paid',
          },
          customer: {
            id: event.commerceOrder.customerReference,
            email: event.commerceOrder.customerEmail,
          },
          product: {
            reference: event.commerceOrder.productReference,
            quantity: event.commerceOrder.quantity,
          },
          metadata: {
            paymentReference: paymentReferenceValueFrom(event.paymentReference),
            paymentSource: paymentSourceValueFrom(event.paymentSource),
            paymentStatus: event.paymentStatus,
            ...event.metadata,
          },
        },
      }),
    );
  }
}

const paymentReferenceValueFrom = (
  reference: PaymentAuthorizedFulfillmentEvent['paymentReference'],
): string => reference as string;

const paymentSourceValueFrom = (
  source: PaymentAuthorizedFulfillmentEvent['paymentSource'],
): string => source as string;

export const createPaymentAuthorizedFulfillmentEnvelope = (params: {
  event: PaymentAuthorizedFulfillmentEvent;
  sourceId: string;
  externalEventId: string;
  receivedAt: Date;
}): ExternalEventEnvelope =>
  createExternalEventEnvelope({
    sourceId: params.sourceId,
    externalEventId: params.externalEventId,
    eventType: 'payment.confirmed',
    receivedAt: params.receivedAt,
    payload: createPaymentAuthorizedFulfillmentEvent(params.event),
    headers: {},
    metadata: {
      externalOrderReference: params.event.externalOrderReference,
      paymentReference: paymentReferenceValueFrom(params.event.paymentReference),
    },
  });

export { validatePaymentAuthorizedFulfillmentEvent };
