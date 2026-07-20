import { describe, expect, it } from 'vitest';

import { createExternalEventEnvelope } from '@dap/core';

import { createWooCommerceInboundGatewayStack } from '../composition/create-woocommerce-inbound-gateway-stack.js';
import {
  createSignedWooCommerceWebhookInput,
  TEST_WOOCOMMERCE_PRODUCT_ID,
  TEST_WOOCOMMERCE_WEBHOOK_SECRET,
} from '../fixtures/woocommerce-order-fixtures.js';
import { SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC } from '../constants/woocommerce-webhook-topic.js';
import { createWooCommerceSourceId } from '../constants/woocommerce-source-id.js';
import { WooCommerceEnvelopeFactory } from '../envelope/woocommerce-envelope-factory.js';
import { FakeWooCommerceSignatureVerifier } from '../signature/fake-woocommerce-signature-verifier.js';

const assertSensitiveValuesAbsent = (serialized: string): void => {
  expect(serialized).not.toContain(TEST_WOOCOMMERCE_WEBHOOK_SECRET);
  expect(serialized).not.toContain('SENTINEL_SIGNATURE_VALUE');
};

const processSignedWebhook = async (
  stack: Awaited<ReturnType<typeof createWooCommerceInboundGatewayStack>>,
  options: Parameters<typeof createSignedWooCommerceWebhookInput>[0] = {},
) => {
  const input = createSignedWooCommerceWebhookInput(options);
  const envelopeResult = stack.envelopeFactory.create(input);

  if (!envelopeResult.ok) {
    return { envelopeResult, gatewayResult: undefined };
  }

  const gatewayResult = await stack.inboundGateway.process(
    envelopeResult.value,
    stack.inboundAdapter,
  );

  return { envelopeResult, gatewayResult, input };
};

describe('WooCommerce inbound gateway integration', () => {
  it('processes a valid processing order through the full fulfillment pipeline', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack, { status: 'processing' });

    expect(gatewayResult?.status).toBe('processed');
    expect(gatewayResult?.orchestrationResult?.overallStatus).toBe('succeeded');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('processes a valid completed order through the full fulfillment pipeline', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack, { status: 'completed' });

    expect(gatewayResult?.status).toBe('processed');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('rejects invalid signatures before normalization', async () => {
    const stack = await createWooCommerceInboundGatewayStack();
    stack.signatureVerifier.configureValid(false);
    const input = createSignedWooCommerceWebhookInput();
    const envelopeResult = stack.envelopeFactory.create({
      ...input,
      signature: 'SENTINEL_SIGNATURE_VALUE',
    });

    expect(envelopeResult.ok).toBe(false);

    if (!envelopeResult.ok) {
      expect(envelopeResult.error.failureCode).toBe('INVALID_SIGNATURE');
      assertSensitiveValuesAbsent(JSON.stringify(envelopeResult.error));
    }

    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
  });

  it('rejects malformed payloads from the envelope factory', async () => {
    const stack = await createWooCommerceInboundGatewayStack();
    const input = createSignedWooCommerceWebhookInput();
    const envelopeResult = stack.envelopeFactory.create({
      ...input,
      rawBody: '{not-json',
    });

    expect(envelopeResult.ok).toBe(false);

    if (!envelopeResult.ok) {
      expect(envelopeResult.error.failureCode).toBe('MALFORMED_PAYLOAD');
    }
  });

  it('rejects unsupported webhook topics at the envelope factory', async () => {
    const stack = await createWooCommerceInboundGatewayStack();
    const input = createSignedWooCommerceWebhookInput({ topic: 'customer.updated' });
    const envelopeResult = stack.envelopeFactory.create(input);

    expect(envelopeResult.ok).toBe(false);

    if (!envelopeResult.ok) {
      expect(envelopeResult.error.failureCode).toBe('UNSUPPORTED_TOPIC');
    }
  });

  it.each(['pending', 'on-hold', 'failed', 'cancelled', 'refunded'])(
    'does not fulfill unsupported order status %s',
    async (status) => {
      const stack = await createWooCommerceInboundGatewayStack({
        productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
      });
      const { gatewayResult } = await processSignedWebhook(stack, { status });

      expect(gatewayResult?.status).toBe('rejected');
      expect(gatewayResult?.failureCode).toBe('UNSUPPORTED_ORDER_STATUS');
      expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
      expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
    },
  );

  it('executes fulfillment once for duplicate WooCommerce deliveries', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const input = createSignedWooCommerceWebhookInput({ deliveryId: 'delivery-dup-001' });
    const firstEnvelope = stack.envelopeFactory.create(input);
    const secondEnvelope = stack.envelopeFactory.create(input);

    expect(firstEnvelope.ok).toBe(true);
    expect(secondEnvelope.ok).toBe(true);

    if (!firstEnvelope.ok || !secondEnvelope.ok) {
      throw new Error('Expected valid envelopes.');
    }

    const first = await stack.inboundGateway.process(firstEnvelope.value, stack.inboundAdapter);
    const second = await stack.inboundGateway.process(secondEnvelope.value, stack.inboundAdapter);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('processes the same order again when a distinct valid event identity is supplied', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });

    const first = await processSignedWebhook(stack, {
      deliveryId: 'delivery-status-processing',
      status: 'processing',
      dateModified: '2026-07-20T10:05:00',
    });
    const second = await processSignedWebhook(stack, {
      deliveryId: 'delivery-status-completed',
      status: 'completed',
      dateModified: '2026-07-20T11:00:00',
    });

    expect(first.gatewayResult?.status).toBe('processed');
    expect(second.gatewayResult?.status).toBe('processed');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(2);
  });

  it('keeps webhook secrets and signatures out of gateway failures and audit records', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack, { status: 'pending' });

    assertSensitiveValuesAbsent(JSON.stringify(gatewayResult));

    if (gatewayResult?.executionRunId !== undefined) {
      const audit = await stack.executionRunCoordinator.getAuditRecord(
        gatewayResult.executionRunId,
      );
      assertSensitiveValuesAbsent(JSON.stringify(audit));
    }
  });

  it('keeps raw payload out of execution audit records', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(
      gatewayResult!.executionRunId!,
    );

    expect(JSON.stringify(audit)).not.toContain('"billing"');
    expect(JSON.stringify(audit)).not.toContain('line_items');
  });

  it('converts unexpected verifier exceptions into safe typed failures', async () => {
    const verifier = new FakeWooCommerceSignatureVerifier();
    verifier.configureException(new Error('verifier exploded with SENTINEL_WEBHOOK_SECRET'));
    const factory = new WooCommerceEnvelopeFactory({ signatureVerifier: verifier });
    const input = createSignedWooCommerceWebhookInput();
    const envelopeResult = factory.create(input);

    expect(envelopeResult.ok).toBe(false);

    if (!envelopeResult.ok) {
      expect(envelopeResult.error.failureCode).toBe('SIGNATURE_VERIFIER_EXCEPTION');
      assertSensitiveValuesAbsent(JSON.stringify(envelopeResult.error));
    }
  });

  it('uses the real inbound gateway, idempotency, lifecycle, matcher, orchestrator, and pipeline', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack, { deliveryId: 'delivery-e2e-001' });

    expect(gatewayResult?.status).toBe('processed');
    expect(gatewayResult?.executionRunId).toBeDefined();

    const audit = await stack.executionRunCoordinator.getAuditRecord(
      gatewayResult!.executionRunId!,
    );

    expect(audit?.status).toBe('completed');
    expect(audit?.stepSummaries.map((step) => step.stepName)).toEqual([
      'Validate Order',
      'Reserve Inventory',
      'Provision Digital Product',
      'Notify Customer',
    ]);
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(1);
  });

  it('does not leak WooCommerce-specific models into normalized platform event contracts', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const input = createSignedWooCommerceWebhookInput();
    const envelopeResult = stack.envelopeFactory.create(input);

    expect(envelopeResult.ok).toBe(true);

    if (!envelopeResult.ok) {
      throw new Error('Expected valid envelope.');
    }

    const normalization = await stack.inboundAdapter.normalize(envelopeResult.value);

    expect(normalization.ok).toBe(true);

    if (normalization.ok) {
      expect(JSON.stringify(normalization.value)).not.toContain('line_items');
      expect(JSON.stringify(normalization.value)).not.toContain('billing');
      expect(normalization.value.payload.order).toEqual({ id: '1001', status: 'paid' });
    }
  });

  it('keeps envelope and parsed models immutable during processing', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const input = createSignedWooCommerceWebhookInput({ deliveryId: 'delivery-immutable-001' });
    const envelopeResult = stack.envelopeFactory.create(input);

    expect(envelopeResult.ok).toBe(true);

    if (!envelopeResult.ok) {
      throw new Error('Expected valid envelope.');
    }

    const envelopeSnapshot = JSON.stringify(envelopeResult.value);
    await stack.inboundGateway.process(envelopeResult.value, stack.inboundAdapter);

    expect(JSON.stringify(envelopeResult.value)).toBe(envelopeSnapshot);
  });

  it('rejects gateway processing when envelope payload is replaced with malformed data', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const envelope = createExternalEventEnvelope({
      sourceId: createWooCommerceSourceId('lord-tv-store'),
      externalEventId: 'delivery-malformed-001',
      eventType: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC,
      receivedAt: new Date('2026-07-20T10:06:00.000Z'),
      payload: 'not-an-object',
      headers: {},
      metadata: { topic: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC },
    });

    const result = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('MALFORMED_PAYLOAD');
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
  });

  it('rejects multiple line items before fulfillment', async () => {
    const stack = await createWooCommerceInboundGatewayStack({
      productReference: String(TEST_WOOCOMMERCE_PRODUCT_ID),
    });
    const { gatewayResult } = await processSignedWebhook(stack, {
      lineItems: [
        { product_id: TEST_WOOCOMMERCE_PRODUCT_ID, variation_id: 0, quantity: 1, meta_data: [] },
        { product_id: 99002, variation_id: 0, quantity: 1, meta_data: [] },
      ],
    });

    expect(gatewayResult?.status).toBe('rejected');
    expect(gatewayResult?.failureCode).toBe('MULTIPLE_LINE_ITEMS');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });
});
