import { Result } from '../../shared/types/result.js';
import { createNormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import { createExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import type { ExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import { InboundEventNormalizationError } from '../../domain/inbound-event/errors/inbound-event-errors.js';
import type { InboundEventAdapter } from './inbound-event-adapter.js';

type ValidExternalOrderPaidPayload = {
  readonly orderId: string;
  readonly customerId: string;
  readonly customerEmail: string;
  readonly productReference: string;
  readonly quantity: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidOrderPaidPayload = (payload: unknown): payload is ValidExternalOrderPaidPayload => {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.orderId === 'string' &&
    payload.orderId.trim().length > 0 &&
    typeof payload.customerId === 'string' &&
    payload.customerId.trim().length > 0 &&
    typeof payload.customerEmail === 'string' &&
    payload.customerEmail.trim().length > 0 &&
    typeof payload.productReference === 'string' &&
    payload.productReference.trim().length > 0 &&
    typeof payload.quantity === 'number' &&
    Number.isInteger(payload.quantity) &&
    payload.quantity >= 0
  );
};

export type FakeInboundEventAdapterOptions = {
  readonly configuredError?: InboundEventNormalizationError;
  readonly configuredException?: Error;
};

/**
 * Test-focused inbound adapter mapping external order-paid envelopes to normalized events.
 */
export class FakeInboundEventAdapter implements InboundEventAdapter {
  private configuredError?: InboundEventNormalizationError;
  private configuredException?: Error;

  constructor(options: FakeInboundEventAdapterOptions = {}) {
    this.configuredError = options.configuredError;
    this.configuredException = options.configuredException;
  }

  configureError(error: InboundEventNormalizationError): void {
    this.configuredError = error;
    this.configuredException = undefined;
  }

  configureException(error: Error): void {
    this.configuredException = error;
    this.configuredError = undefined;
  }

  reset(): void {
    this.configuredError = undefined;
    this.configuredException = undefined;
  }

  async normalize(envelope: ExternalEventEnvelope) {
    if (this.configuredException !== undefined) {
      throw this.configuredException;
    }

    if (this.configuredError !== undefined) {
      return Result.fail(this.configuredError);
    }

    if (envelope.eventType !== 'order.paid') {
      return Result.fail(
        new InboundEventNormalizationError(
          `Unsupported inbound event type "${envelope.eventType}" from source "${envelope.sourceId}".`,
          'UNSUPPORTED_EVENT_TYPE',
        ),
      );
    }

    if (!isValidOrderPaidPayload(envelope.payload)) {
      return Result.fail(
        new InboundEventNormalizationError(
          `Malformed inbound event "${envelope.externalEventId}" from source "${envelope.sourceId}".`,
          'MALFORMED_PAYLOAD',
        ),
      );
    }

    const payload = envelope.payload;
    const eventId = `${envelope.sourceId}:${envelope.externalEventId}`;

    return Result.ok(
      createNormalizedPlatformEvent({
        eventId,
        eventType: envelope.eventType,
        occurredAt: envelope.receivedAt,
        payload: {
          order: {
            id: payload.orderId,
            status: 'paid',
          },
          customer: {
            id: payload.customerId,
            email: payload.customerEmail,
          },
          product: {
            reference: payload.productReference,
            quantity: payload.quantity,
          },
          metadata: envelope.metadata,
        },
      }),
    );
  }
}

export const createValidExternalOrderPaidEnvelope = (
  overrides: Partial<ExternalEventEnvelope> = {},
): ExternalEventEnvelope =>
  createExternalEventEnvelope({
    sourceId: 'test-store',
    externalEventId: 'ext-evt-001',
    eventType: 'order.paid',
    receivedAt: new Date('2026-07-20T06:00:00.000Z'),
    payload: {
      orderId: 'order-1001',
      customerId: 'customer-42',
      customerEmail: 'customer@example.com',
      productReference: 'digital-premium-12m',
      quantity: 1,
    },
    headers: {},
    metadata: { channel: 'test' },
    ...overrides,
  });
