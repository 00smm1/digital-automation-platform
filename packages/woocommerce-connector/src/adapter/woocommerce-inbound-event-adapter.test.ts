import { describe, expect, it } from 'vitest';

import { createExternalEventEnvelope } from '@dap/core';

import { WooCommerceInboundEventAdapter } from './woocommerce-inbound-event-adapter.js';
import { createWooCommerceOrderPayload } from '../fixtures/woocommerce-order-fixtures.js';
import { createWooCommerceSourceId } from '../constants/woocommerce-source-id.js';
import { SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC } from '../constants/woocommerce-webhook-topic.js';

const adapter = new WooCommerceInboundEventAdapter();

const createEnvelope = (
  payload: Record<string, unknown>,
  overrides: {
    externalEventId?: string;
    metadata?: Record<string, unknown>;
  } = {},
) =>
  createExternalEventEnvelope({
    sourceId: createWooCommerceSourceId('lord-tv-store'),
    externalEventId: overrides.externalEventId ?? 'delivery-001',
    eventType: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC,
    receivedAt: new Date('2026-07-20T10:06:00.000Z'),
    payload,
    headers: {},
    metadata: overrides.metadata ?? { topic: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC },
  });

describe('WooCommerceInboundEventAdapter', () => {
  it('normalizes a valid paid WooCommerce order', async () => {
    const result = await adapter.normalize(createEnvelope(createWooCommerceOrderPayload()));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.eventType).toBe('order.paid');
      expect(result.value.payload.order).toEqual({ id: '1001', status: 'paid' });
      expect(result.value.payload.product).toEqual({
        reference: '99001',
        quantity: 1,
      });
    }
  });

  it('rejects unsupported webhook topics', async () => {
    const envelope = createExternalEventEnvelope({
      sourceId: createWooCommerceSourceId('lord-tv-store'),
      externalEventId: 'delivery-001',
      eventType: 'order.deleted',
      receivedAt: new Date('2026-07-20T10:06:00.000Z'),
      payload: createWooCommerceOrderPayload(),
      headers: {},
      metadata: {},
    });

    const result = await adapter.normalize(envelope);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('UNSUPPORTED_TOPIC');
    }
  });

  it('rejects malformed payloads', async () => {
    const envelope = createExternalEventEnvelope({
      sourceId: createWooCommerceSourceId('lord-tv-store'),
      externalEventId: 'delivery-001',
      eventType: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC,
      receivedAt: new Date('2026-07-20T10:06:00.000Z'),
      payload: null,
      headers: {},
      metadata: { topic: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC },
    });
    const result = await adapter.normalize(envelope);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MALFORMED_PAYLOAD');
    }
  });

  it.each(['pending', 'on-hold', 'failed', 'cancelled', 'refunded'])(
    'rejects unsupported order status %s',
    async (status) => {
      const result = await adapter.normalize(
        createEnvelope(createWooCommerceOrderPayload({ status })),
      );

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.error.failureCode).toBe('UNSUPPORTED_ORDER_STATUS');
      }
    },
  );

  it('accepts processing and completed statuses', async () => {
    for (const status of ['processing', 'completed'] as const) {
      const result = await adapter.normalize(
        createEnvelope(createWooCommerceOrderPayload({ status })),
      );

      expect(result.ok).toBe(true);
    }
  });

  it('rejects missing order ID', async () => {
    const payload = createWooCommerceOrderPayload();
    delete payload.id;

    const result = await adapter.normalize(createEnvelope(payload));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MISSING_ORDER_ID');
    }
  });

  it('rejects missing line items', async () => {
    const result = await adapter.normalize(
      createEnvelope(createWooCommerceOrderPayload({ lineItems: [] })),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MISSING_LINE_ITEMS');
    }
  });

  it('rejects invalid product ID', async () => {
    const result = await adapter.normalize(
      createEnvelope(
        createWooCommerceOrderPayload({
          lineItems: [{ product_id: 0, variation_id: 0, quantity: 1, meta_data: [] }],
        }),
      ),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('INVALID_PRODUCT_REFERENCE');
    }
  });

  it('prefers variation ID over product ID', async () => {
    const result = await adapter.normalize(
      createEnvelope(
        createWooCommerceOrderPayload({
          productId: 99001,
          variationId: 88002,
        }),
      ),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload.product).toEqual({
        reference: '88002',
        quantity: 1,
      });
    }
  });

  it('uses product ID when variation ID is absent or zero', async () => {
    const result = await adapter.normalize(
      createEnvelope(createWooCommerceOrderPayload({ productId: 99001, variationId: 0 })),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload.product).toEqual({
        reference: '99001',
        quantity: 1,
      });
    }
  });

  it('preserves quantity', async () => {
    const result = await adapter.normalize(
      createEnvelope(createWooCommerceOrderPayload({ quantity: 3 })),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload.product).toEqual({
        reference: '99001',
        quantity: 3,
      });
    }
  });

  it('rejects invalid quantity', async () => {
    const result = await adapter.normalize(
      createEnvelope(createWooCommerceOrderPayload({ quantity: 0 })),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('INVALID_QUANTITY');
    }
  });

  it('rejects multiple fulfillable line items', async () => {
    const result = await adapter.normalize(
      createEnvelope(
        createWooCommerceOrderPayload({
          lineItems: [
            { product_id: 99001, variation_id: 0, quantity: 1, meta_data: [] },
            { product_id: 99002, variation_id: 0, quantity: 1, meta_data: [] },
          ],
        }),
      ),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MULTIPLE_LINE_ITEMS');
    }
  });

  it('maps WooCommerce customer ID', async () => {
    const result = await adapter.normalize(
      createEnvelope(createWooCommerceOrderPayload({ customerId: 7777 })),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload.customer).toEqual({
        id: '7777',
        email: 'customer@example.com',
      });
    }
  });

  it('falls back to billing email for guest customers', async () => {
    const result = await adapter.normalize(
      createEnvelope(
        createWooCommerceOrderPayload({
          customerId: 0,
          billingEmail: 'guest@example.com',
        }),
      ),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.payload.customer).toEqual({
        id: 'guest@example.com',
        email: 'guest@example.com',
      });
    }
  });

  it('converts unexpected parser exceptions into safe typed failures', async () => {
    const envelope = createEnvelope(createWooCommerceOrderPayload());
    Object.defineProperty(envelope, 'payload', {
      get() {
        throw new Error('parser exploded with SENTINEL_WEBHOOK_SECRET');
      },
    });

    const result = await adapter.normalize(envelope);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('PARSER_EXCEPTION');
      expect(JSON.stringify(result.error)).not.toContain('SENTINEL_WEBHOOK_SECRET');
    }
  });
});
