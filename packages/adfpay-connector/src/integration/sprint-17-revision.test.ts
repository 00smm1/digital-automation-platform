import { describe, expect, it } from 'vitest';

import { AdfPayPaymentGatewayAdapter } from '../adapter/adfpay-payment-gateway-adapter.js';
import { FakeAdfPaySignatureVerifier } from '../signature/fake-adfpay-signature-verifier.js';
import {
  createAdfPayPaymentIngressInput,
  TEST_ADFPAY_PRODUCT_REFERENCE,
} from '../fixtures/adfpay-payment-fixtures.js';
import {
  createPaymentFulfillmentGatewayStack,
  createCommerceOrderRecord,
  createMoney,
  InMemoryCommerceOrderReadPort,
  PaymentProcessingFailure,
} from '@dap/payment';
import { OrderFulfillmentAuthorizationError } from '@dap/core';
import { createValidExternalOrderPaidEnvelope, FakeInboundEventAdapter } from '@dap/core';
import {
  ALL_SENTINELS,
  assertSentinelsAbsent,
  createScenarioStack,
} from '../testing/scenario-test-helpers.js';

describe('Sprint 17 revision — fulfillment data source', () => {
  it('[1][2][3][4] AdfPay payload cannot select product, quantity, or customerReference', async () => {
    const commerceOrderReadPort = new InMemoryCommerceOrderReadPort();
    commerceOrderReadPort.save(
      createCommerceOrderRecord({
        externalOrderReference: '7001',
        productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
        quantity: 1,
        customerReference: 'trusted-customer',
        customerEmail: 'trusted@example.com',
        expectedAmount: createMoney({ amountMinorUnits: 4900, currency: 'USD' }),
      }),
    );

    const stack = await createPaymentFulfillmentGatewayStack({
      productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
      paymentGatewayAdapter: new AdfPayPaymentGatewayAdapter({
        signatureVerifier: new FakeAdfPaySignatureVerifier(),
      }),
      commerceOrderReadPort,
      seedDefaultCommerceOrder: false,
    });

    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({
        orderId: '7001',
        paymentId: 'pay-trusted-source',
        productReference: 'malicious-product',
        quantity: 99,
        customerId: 'attacker',
        customerEmail: 'attacker@example.com',
      }),
    );

    expect(result.fulfillmentExecuted).toBe(true);
    expect(stack.notificationAdapter.getSentNotifications()[0]?.orderReference).toBe('7001');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
    expect(
      await stack.inventoryRepository.countAvailableByProductId(TEST_ADFPAY_PRODUCT_REFERENCE),
    ).toBe(4);
  });

  it('[5][6] missing commerce order rejects payment correlation', async () => {
    const stack = await createPaymentFulfillmentGatewayStack({
      productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
      paymentGatewayAdapter: new AdfPayPaymentGatewayAdapter({
        signatureVerifier: new FakeAdfPaySignatureVerifier(),
      }),
      commerceOrderReadPort: new InMemoryCommerceOrderReadPort(),
      seedDefaultCommerceOrder: false,
    });

    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ orderId: 'missing-order', paymentId: 'pay-missing' }),
    );

    expect(result.fulfillmentExecuted).toBe(false);
    expect(result.reasonCode).toBe('CORRELATION_FAILED');
  });

  it('[16][17][18][19] confirmed payment fulfills, duplicates do not, commerce path blocked', async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput({
      paymentId: 'pay-revision-dup',
      orderId: '1001',
    });
    const first = await stack.paymentProcessingService.process(input);
    const second = await stack.paymentProcessingService.process(input);

    expect(first.fulfillmentExecuted).toBe(true);
    expect(second.outcome).toBe('duplicate');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);

    const pending = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({
        status: 'pending',
        paymentId: 'pay-pending-rev',
        orderId: '1001',
      }),
    );
    expect(pending.fulfillmentExecuted).toBe(false);

    const commerce = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope({
        sourceId: 'woocommerce:lord-tv-store',
        externalEventId: 'wc-revision-001',
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

    const paymentAfterCommerce = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ orderId: '9401', paymentId: 'pay-after-commerce-rev' }),
    );
    expect(paymentAfterCommerce.fulfillmentExecuted).toBe(false);
  });

  it('[10] repository update failure after fulfillment is surfaced safely', async () => {
    const stack = await createScenarioStack();
    stack.paymentRepository.configureUpdateFailure(
      new PaymentProcessingFailure('Repository unavailable.'),
    );

    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-update-fail', orderId: '9601' }),
    );

    expect(result.outcome).toBe('partial_processing');
    expect(result.fulfillmentExecuted).toBe(true);
    expect(result.reasonCode).toBe('REPOSITORY_UPDATE_FAILED');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('[11] markFulfilled failure is surfaced safely without re-executing fulfillment', async () => {
    const stack = await createScenarioStack();
    stack.orderFulfillmentAuthorization.configureMarkFulfilledFailure(
      new OrderFulfillmentAuthorizationError(
        'Order fulfillment state could not be finalized.',
        'ORDER_FULFILLMENT_MARK_FAILED',
      ),
    );

    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-mark-fail', orderId: '9801' }),
    );

    expect(result.outcome).toBe('partial_processing');
    expect(result.fulfillmentExecuted).toBe(true);
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);

    const duplicate = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-mark-fail', orderId: '9801' }),
    );
    expect(duplicate.outcome).toBe('duplicate');
    expect(stack.provisioningAdapter.getProvisionCount()).toBe(1);
  });

  it('[12] release failure is surfaced safely', async () => {
    const stack = await createScenarioStack();
    stack.provisioningAdapter.configureException(new Error('SENTINEL_ORCHESTRATION_DO_NOT_LEAK'));
    stack.orderFulfillmentAuthorization.configureReleaseFailure(
      new OrderFulfillmentAuthorizationError(
        'Order fulfillment release failed.',
        'ORDER_FULFILLMENT_RELEASE_FAILED',
      ),
    );

    const result = await stack.paymentProcessingService.process(
      createAdfPayPaymentIngressInput({ paymentId: 'pay-release-fail', orderId: '9601' }),
    );

    expect(result.fulfillmentExecuted).toBe(false);
    expect(result.inboundResult?.failureCode).toBe('ORDER_FULFILLMENT_RELEASE_FAILED');
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[20] keeps sentinel values out of public outputs', async () => {
    const stack = await createScenarioStack();
    const input = createAdfPayPaymentIngressInput({
      paymentId: 'pay-security-rev',
      orderId: '1001',
    });
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
