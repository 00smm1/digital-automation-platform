import { describe, expect, it } from 'vitest';

import { AdfPayPaymentGatewayAdapter } from '../adapter/adfpay-payment-gateway-adapter.js';
import { FakeAdfPaySignatureVerifier } from '../signature/fake-adfpay-signature-verifier.js';
import {
  createAdfPayPaymentIngressInput,
  TEST_ADFPAY_PRODUCT_REFERENCE,
} from '../fixtures/adfpay-payment-fixtures.js';
import { createValidExternalOrderPaidEnvelope, FakeInboundEventAdapter } from '@dap/core';
import {
  ALL_SENTINELS,
  assertSentinelsAbsent,
  createScenarioStack,
  SENTINEL_AUTH_TOKEN,
  SENTINEL_CARD_NUMBER,
  SENTINEL_GATEWAY_SECRET,
  SENTINEL_PROVISIONING_PASSWORD,
  SENTINEL_RAW_PAYMENT_BODY,
  SENTINEL_SIGNATURE,
} from '../testing/scenario-test-helpers.js';

describe('Sprint 17 payment scenarios — normalization and verification', () => {
  it('[S01][S06][S07][S08][S09] normalizes confirmed payment and preserves references', async () => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const input = createAdfPayPaymentIngressInput({
      paymentId: 'pay-norm-001',
      orderId: '9001',
      occurredAt: '2026-07-21T08:00:00.000Z',
    });
    const result = await adapter.normalize(input);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(String(result.value.paymentReference)).toBe('pay-norm-001');
      expect(result.value.externalOrderReference).toBe('9001');
      expect(String(result.value.paymentSource)).toContain('adfpay:');
      expect(result.value.occurredAt.toISOString()).toBe('2026-07-21T08:00:00.000Z');
    }
  });

  it.each([
    ['pending', 'S02'],
    ['failed', 'S03'],
    ['cancelled', 'S04'],
    ['refunded', 'S05'],
  ] as const)('[%s] trusted %s payment normalizes without fulfillment', async (status, label) => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const normalized = await adapter.normalize(
      createAdfPayPaymentIngressInput({ status, paymentId: `pay-${status}` }),
    );

    expect(normalized.ok).toBe(true);

    const stack = await createScenarioStack();
    const processed = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ status, paymentId: `pay-${status}-fulfill` }),
    );

    expect(processed.fulfillmentExecuted).toBe(false);
    expect(label.length).toBeGreaterThan(0);
  });

  it('[S10] keeps ingress input payload immutable', async () => {
    const input = createAdfPayPaymentIngressInput();
    const originalBody = input.rawBody;
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });

    await adapter.normalize(input);
    expect(input.rawBody).toBe(originalBody);
  });

  it('[S11][S12][S13][S14] invalid authenticity is rejected without side effects', async () => {
    const verifier = new FakeAdfPaySignatureVerifier();
    verifier.configureValid(false);
    const stack = await createScenarioStack(verifier);
    const result = await stack.paymentProcessingService.process(createAdfPayPaymentIngressInput());

    expect(result.reasonCode).toBe('VERIFICATION_FAILED');
    expect(stack.paymentRepository.getAllRecords()).toHaveLength(0);
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(0);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('[S15][S16] verifier exception becomes safe typed failure without leaking text', async () => {
    const verifier = new FakeAdfPaySignatureVerifier();
    verifier.configureException(new Error('SENTINEL_INTERNAL_VERIFIER_STACK_DO_NOT_LEAK'));
    const adapter = new AdfPayPaymentGatewayAdapter({ signatureVerifier: verifier });
    const result = await adapter.normalize(createAdfPayPaymentIngressInput());

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('MALFORMED_PAYLOAD');
      expect(result.error.message).not.toContain('SENTINEL_INTERNAL_VERIFIER_STACK_DO_NOT_LEAK');
    }
  });

  it('[S19] rejects unsupported gateway event type', async () => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const result = await adapter.normalize(
      createAdfPayPaymentIngressInput({ eventType: 'payment.unknown' }),
    );

    expect(result.ok).toBe(false);
  });

  it('[S24] raw payload does not appear in returned failures', async () => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const result = await adapter.normalize({
      ...createAdfPayPaymentIngressInput(),
      rawBody: `${SENTINEL_RAW_PAYMENT_BODY}{invalid`,
    });

    expect(result.ok).toBe(false);
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 17 payment scenarios — duplicates, conflicts, and fulfillment', () => {
  it('[S32] correlation failure creates no fulfillment execution', async () => {
    const stack = await createScenarioStack();
    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ orderId: 'customer@example.com' }),
    );

    expect(result.fulfillmentExecuted).toBe(false);
    expect(result.reasonCode).toBe('CORRELATION_FAILED');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
  });

  it('[S41][S42][S43][S44][S45][S46] duplicate delivery executes fulfillment once', async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput({
      paymentId: 'pay-dup-scenario',
      orderId: '9101',
    });
    const availableBefore = await stack.inventoryRepository.countAvailableByProductId(
      TEST_ADFPAY_PRODUCT_REFERENCE,
    );
    const first = await stack.paymentProcessingService.process(input);
    const second = await stack.paymentProcessingService.process(input);
    const availableAfter = await stack.inventoryRepository.countAvailableByProductId(
      TEST_ADFPAY_PRODUCT_REFERENCE,
    );

    expect(first.outcome).toBe('processed');
    expect(second.outcome).toBe('duplicate');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);
    expect(stack.executionRunRepository.getAllRuns()[0]?.status).toBe('completed');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(availableBefore - availableAfter).toBe(1);
  });

  it('[S47] same payment reference with different order reference is rejected', async () => {
    const stack = await createScenarioStack();
    await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-conflict', orderId: '9201' }),
    );
    const conflict = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-conflict', orderId: '9202' }),
    );

    expect(conflict.outcome).toBe('rejected');
    expect(conflict.reasonCode).toBe('PAYMENT_CONFLICT');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('[S48] different confirmed payment for same order does not fulfill twice', async () => {
    const stack = await createScenarioStack();
    await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-first-order', orderId: '9301' }),
    );
    const second = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-second-order', orderId: '9301' }),
    );

    expect(second.fulfillmentExecuted).toBe(false);
    expect(second.reasonCode).toBe('ALREADY_CONFIRMED');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('[S49] WooCommerce and payment paths cannot both fulfill the same order', async () => {
    const stack = await createScenarioStack();
    const commerce = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope({
        sourceId: 'woocommerce:lord-tv-store',
        externalEventId: 'wc-scenario-001',
        payload: {
          orderId: '9401',
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
      createAdfPayPaymentIngressInput({ orderId: '9401', paymentId: 'pay-after-commerce' }),
    );

    expect(payment.fulfillmentExecuted).toBe(false);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('[S70][S71][S72][S73][S74][S75][S76][S77][S78][S79] confirmed payment exercises real pipeline with order context', async () => {
    const stack = await createScenarioStack();
    const availableBefore = await stack.inventoryRepository.countAvailableByProductId(
      TEST_ADFPAY_PRODUCT_REFERENCE,
    );
    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({
        paymentId: 'pay-e2e',
        orderId: '9501',
        productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
        quantity: 2,
      }),
    );
    const availableAfter = await stack.inventoryRepository.countAvailableByProductId(
      TEST_ADFPAY_PRODUCT_REFERENCE,
    );

    expect(result.fulfillmentExecuted).toBe(true);
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);
    expect(stack.executionRunRepository.getAllRuns()[0]?.status).toBe('completed');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.notificationAdapter.getSentNotifications()[0]?.orderReference).toBe('9501');
    expect(availableBefore - availableAfter).toBe(2);
  });

  it('[S80][S81][S82][S83] non-confirmed payments create no fulfillment side effects', async () => {
    for (const status of ['pending', 'failed', 'cancelled', 'refunded'] as const) {
      const stack = await createScenarioStack();
      const result = await stack.paymentProcessingService.process(
        createAdfPayPaymentIngressInput({ status, paymentId: `pay-no-fulfill-${status}` }),
      );

      expect(result.fulfillmentExecuted).toBe(false);
      expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
      expect(stack.provisioningAdapter.getProvisionCount()).toBe(0);
      expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
    }
  });

  it('[S84] orchestration exception becomes controlled typed failure', async () => {
    const stack = await createScenarioStack();
    stack.provisioningAdapter.configureException(new Error('SENTINEL_ORCHESTRATION_DO_NOT_LEAK'));
    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-orchestration-fail', orderId: '9601' }),
    );

    expect(result.outcome).toBe('failed');
    expect(result.fulfillmentExecuted).toBe(false);
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 17 payment scenarios — sensitive data safety', () => {
  const collectSerializedOutputs = async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput({
      paymentId: 'pay-security',
      orderId: '9701',
      secret: SENTINEL_GATEWAY_SECRET,
      signature: SENTINEL_SIGNATURE,
    });
    const body = {
      ...JSON.parse(input.rawBody),
      card_number: SENTINEL_CARD_NUMBER,
      auth_token: SENTINEL_AUTH_TOKEN,
      raw_note: SENTINEL_RAW_PAYMENT_BODY,
    };
    const processed = await stack.paymentProcessingService.process({
      ...input,
      rawBody: JSON.stringify(body),
    });
    const audit =
      processed.executionRunId === undefined
        ? null
        : await stack.executionRunCoordinator.getAuditRecord(processed.executionRunId);

    return {
      processed,
      records: stack.paymentRepository.getAllRecords(),
      runs: stack.executionRunRepository.getAllRuns(),
      audit,
    };
  };

  it('[S86][S87][S88][S89][S90][S91][S92][S93][S94][S95] keeps sentinel values out of public outputs', async () => {
    const outputs = await collectSerializedOutputs();
    const serialized = JSON.stringify(outputs);

    for (const sentinel of ALL_SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }

    expect(serialized).not.toContain(SENTINEL_PROVISIONING_PASSWORD);
  });

  it('[S85] provisioning secrets remain absent from audit results', async () => {
    const stack = await createScenarioStack();
    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-audit', orderId: '9801' }),
    );

    expect(result.executionRunId).toBeDefined();
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    assertSentinelsAbsent(JSON.stringify(audit));
    expect(JSON.stringify(audit)).not.toContain('secret-');
  });
});

describe('Sprint 17 payment scenarios — architecture', () => {
  it('[S108] production exports do not include test fixtures', async () => {
    const productionIndex = await import('../index.js');
    expect(productionIndex).not.toHaveProperty('createAdfPayPaymentIngressInput');
    expect(productionIndex).not.toHaveProperty('TEST_ADFPAY_SIGNATURE');
  });
});
