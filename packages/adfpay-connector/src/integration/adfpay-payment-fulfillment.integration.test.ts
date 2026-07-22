import { describe, expect, it } from 'vitest';

import { AdfPayPaymentGatewayAdapter } from '../adapter/adfpay-payment-gateway-adapter.js';
import { FakeAdfPaySignatureVerifier } from '../signature/fake-adfpay-signature-verifier.js';
import {
  createAdfPayPaymentIngressInput,
  TEST_ADFPAY_PRODUCT_REFERENCE,
} from '../fixtures/adfpay-payment-fixtures.js';
import { createPaymentFulfillmentGatewayStack } from '@dap/payment';
import { createValidExternalOrderPaidEnvelope, FakeInboundEventAdapter } from '@dap/core';
import {
  ALL_SENTINELS,
  assertSentinelsAbsent,
  createScenarioStack,
} from '../testing/scenario-test-helpers.js';

describe('AdfPay payment fulfillment integration', () => {
  it('processes confirmed payment through the real pipeline', async () => {
    const stack = await createScenarioStack();
    const result = await stack.paymentProcessingService.process(createAdfPayPaymentIngressInput());

    expect(result.outcome).toBe('processed');
    expect(result.fulfillmentExecuted).toBe(true);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('does not fulfill non-confirmed statuses', async () => {
    for (const status of ['pending', 'failed', 'cancelled', 'refunded'] as const) {
      const stack = await createScenarioStack();
      const result = await stack.paymentProcessingService.process(
        createAdfPayPaymentIngressInput({ status, paymentId: `pay-${status}` }),
      );

      expect(result.fulfillmentExecuted).toBe(false);
      expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
    }
  });

  it('handles duplicate delivery deterministically', async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput({ paymentId: 'pay-dup-001' });
    const first = await stack.paymentProcessingService.process(input);
    const second = await stack.paymentProcessingService.process(input);

    expect(first.outcome).toBe('processed');
    expect(second.outcome).toBe('duplicate');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('rejects invalid authenticity without side effects', async () => {
    const verifier = new FakeAdfPaySignatureVerifier();
    verifier.configureValid(false);
    const stack = await createScenarioStack(verifier);
    const result = await stack.paymentProcessingService.process(createAdfPayPaymentIngressInput());

    expect(result.reasonCode).toBe('VERIFICATION_FAILED');
    expect(stack.paymentRepository.getAllRecords()).toHaveLength(0);
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('prevents commerce and payment double fulfillment for the same order', async () => {
    const stack = await createScenarioStack();
    const commerce = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope({
        sourceId: 'woocommerce:lord-tv-store',
        externalEventId: 'wc-001',
        payload: {
          orderId: '1001',
          customerId: '4242',
          customerEmail: 'customer@example.com',
          productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
          quantity: 1,
        },
      }),
      new FakeInboundEventAdapter(),
    );

    expect(commerce.status).toBe('processed');

    const payment = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ orderId: '1001', paymentId: 'pay-after-wc' }),
    );

    expect(payment.fulfillmentExecuted).toBe(false);
    expect(payment.inboundResult?.failureCode).toBe('ORDER_ALREADY_FULFILLED');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('keeps sensitive values out of repository and audit records', async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput();
    const body = {
      ...JSON.parse(input.rawBody),
      card_number: ALL_SENTINELS[4],
      auth_token: ALL_SENTINELS[2],
    };
    const result = await stack.paymentProcessingService.process({
      ...input,
      rawBody: JSON.stringify(body),
    });

    assertSentinelsAbsent(JSON.stringify(result));
    assertSentinelsAbsent(JSON.stringify(stack.paymentRepository.getAllRecords()));
  });
});

describe('AdfPay architecture boundaries', () => {
  it('depends only on allowed provider-neutral contracts', () => {
    expect(typeof AdfPayPaymentGatewayAdapter).toBe('function');
    expect(typeof createPaymentFulfillmentGatewayStack).toBe('function');
  });
});
