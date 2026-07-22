import { describe, expect, it } from 'vitest';

import { createExternalEventEnvelope } from '@dap/core';
import {
  PaymentConfirmationInboundAdapter,
  validatePaymentAuthorizedFulfillmentEvent,
} from './payment-confirmation-inbound-adapter.js';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import { createPaymentAuthorizedFulfillmentEvent } from './payment-authorized-fulfillment-event.js';
import { createCommerceOrderRecord } from '../domain/commerce-order-record.js';
import { Result } from '@dap/core';
import { createPaymentFulfillmentGatewayStack } from '../composition/create-payment-fulfillment-gateway-stack.js';
import type { PaymentGatewayAdapter } from './ports/payment-gateway-adapter.js';
import { PaymentParserFailure } from '../domain/errors/payment-errors.js';

const fakePaymentGatewayAdapter: PaymentGatewayAdapter = {
  normalize: async () => Result.fail(new PaymentParserFailure()),
};

const createValidEventPayload = (
  overrides: Record<string, unknown> = {},
): ReturnType<typeof createPaymentAuthorizedFulfillmentEvent> =>
  createPaymentAuthorizedFulfillmentEvent({
    paymentReference: createPaymentReference('pay-boundary-001')!,
    externalOrderReference: '1001',
    paymentSource: createPaymentSource('adfpay:lord-tv')!,
    paymentStatus: 'confirmed',
    occurredAt: new Date('2026-07-21T08:00:00.000Z'),
    commerceOrder: createCommerceOrderRecord({
      externalOrderReference: '1001',
      productReference: '99001',
      quantity: 1,
      customerReference: '4242',
      customerEmail: 'customer@example.com',
    }),
    metadata: { gatewayEventType: 'payment.updated' },
    ...overrides,
  });

const createEnvelope = (payload: unknown) =>
  createExternalEventEnvelope({
    sourceId: 'adfpay:lord-tv',
    externalEventId: 'pay-event-boundary',
    eventType: 'payment.confirmed',
    receivedAt: new Date('2026-07-21T08:01:00.000Z'),
    payload,
    headers: {},
    metadata: {},
  });

describe('PaymentConfirmationInboundAdapter confirmed-status boundary', () => {
  const adapter = new PaymentConfirmationInboundAdapter();

  it('normalizes confirmed payment status to order.paid', async () => {
    const result = await adapter.normalize(createEnvelope(createValidEventPayload()));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.eventType).toBe('order.paid');
      expect(result.value.payload.order.status).toBe('paid');
    }
  });

  it.each(['pending', 'failed', 'cancelled', 'refunded'] as const)(
    'rejects %s payment status at fulfillment boundary',
    async (status) => {
      const result = await adapter.normalize(
        createEnvelope(createValidEventPayload({ paymentStatus: status })),
      );

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.error.failureCode).toBe('AUTHORIZATION_REJECTED');
      }
    },
  );

  it('rejected statuses invoke no fulfillment pipeline', async () => {
    const stack = await createPaymentFulfillmentGatewayStack({
      productReference: '99001',
      paymentGatewayAdapter: fakePaymentGatewayAdapter,
    });

    const result = await stack.inboundGateway.process(
      createEnvelope(createValidEventPayload({ paymentStatus: 'pending' })),
      adapter,
    );

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('AUTHORIZATION_REJECTED');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(0);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });
});

describe('PaymentConfirmationInboundAdapter unsafe coercion prevention', () => {
  const adapter = new PaymentConfirmationInboundAdapter();

  it.each([
    ['missing paymentReference', { paymentReference: undefined }],
    ['undefined paymentReference', { paymentReference: undefined }],
    ['null paymentReference', { paymentReference: null }],
    ['object paymentReference', { paymentReference: { id: 'pay-001' } }],
    ['missing paymentSource', { paymentSource: undefined }],
    ['undefined paymentSource', { paymentSource: undefined }],
    ['null paymentSource', { paymentSource: null }],
    ['object paymentSource', { paymentSource: { id: 'adfpay:lord-tv' } }],
  ])('rejects %s', async (_label, override) => {
    const payload = { ...createValidEventPayload(), ...override };
    const result = await adapter.normalize(createEnvelope(payload));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MALFORMED_PAYLOAD');
      expect(result.error.message).not.toContain('undefined');
      expect(result.error.message).not.toContain('[object Object]');
    }
  });
});

describe('PaymentConfirmationInboundAdapter order reference consistency', () => {
  const adapter = new PaymentConfirmationInboundAdapter();

  it('accepts matching external order references', async () => {
    const result = validatePaymentAuthorizedFulfillmentEvent(createValidEventPayload());
    expect(result.ok).toBe(true);
  });

  it('rejects different external order references', async () => {
    const payload = createValidEventPayload({
      externalOrderReference: '1001',
      commerceOrder: createCommerceOrderRecord({
        externalOrderReference: '9999',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
    });
    const result = await adapter.normalize(createEnvelope(payload));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('CORRELATION_FAILED');
    }
  });

  it('rejects whitespace-only external order references', async () => {
    const payload = createValidEventPayload({
      externalOrderReference: '   ',
      commerceOrder: createCommerceOrderRecord({
        externalOrderReference: '   ',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
    });
    const result = await adapter.normalize(createEnvelope(payload));

    expect(result.ok).toBe(false);
  });

  it('mismatched references create no fulfillment side effects', async () => {
    const stack = await createPaymentFulfillmentGatewayStack({
      productReference: '99001',
      paymentGatewayAdapter: fakePaymentGatewayAdapter,
    });

    const payload = createValidEventPayload({
      externalOrderReference: '1001',
      commerceOrder: createCommerceOrderRecord({
        externalOrderReference: '2002',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
    });

    const result = await stack.inboundGateway.process(createEnvelope(payload), adapter);

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('CORRELATION_FAILED');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(0);
  });
});
