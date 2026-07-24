import { expect } from 'vitest';

import { AdfPayPaymentGatewayAdapter } from '../adapter/adfpay-payment-gateway-adapter.js';
import { FakeAdfPaySignatureVerifier } from '../signature/fake-adfpay-signature-verifier.js';
import {
  createAdfPayPaymentIngressInput,
  TEST_ADFPAY_GATEWAY_SECRET,
  TEST_ADFPAY_PRODUCT_REFERENCE,
  TEST_ADFPAY_SIGNATURE,
} from '../fixtures/adfpay-payment-fixtures.js';
import { createTestProviderRuntimeStack } from '@dap/provider-runtime';
import { createPaymentFulfillmentGatewayStack } from '@dap/payment';
import type { PaymentFulfillmentGatewayStack } from '@dap/payment';
import { computeAvailableQuantity, createInventoryItemReference } from '@dap/core';

export const getAvailableInventoryQuantity = async (
  stack: PaymentFulfillmentGatewayStack,
  productReference: string,
): Promise<number> => {
  const item = await stack.inventoryReservationRepository.findInventoryItemByReference(
    createInventoryItemReference(productReference),
  );

  if (item === null) {
    return 0;
  }

  return computeAvailableQuantity(item);
};

export const SENTINEL_GATEWAY_SECRET = TEST_ADFPAY_GATEWAY_SECRET;
export const SENTINEL_SIGNATURE = TEST_ADFPAY_SIGNATURE;
export const SENTINEL_AUTH_TOKEN = 'SENTINEL_AUTH_TOKEN_DO_NOT_LEAK';
export const SENTINEL_RAW_PAYMENT_BODY = 'SENTINEL_RAW_PAYMENT_BODY_DO_NOT_LEAK';
export const SENTINEL_CARD_NUMBER = '4111111111111111';
export const SENTINEL_PROVISIONING_PASSWORD = 'SENTINEL_PROVISIONING_PASSWORD_DO_NOT_LEAK';

export const ALL_SENTINELS = [
  SENTINEL_GATEWAY_SECRET,
  SENTINEL_SIGNATURE,
  SENTINEL_AUTH_TOKEN,
  SENTINEL_RAW_PAYMENT_BODY,
  SENTINEL_CARD_NUMBER,
  SENTINEL_PROVISIONING_PASSWORD,
] as const;

export const assertSentinelsAbsent = (serialized: string): void => {
  for (const sentinel of ALL_SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
};

export const createTestPaymentFulfillmentGatewayStack = async (
  options: Parameters<typeof createPaymentFulfillmentGatewayStack>[0],
): Promise<PaymentFulfillmentGatewayStack> => {
  const testProviderRuntime = createTestProviderRuntimeStack();

  return createPaymentFulfillmentGatewayStack({
    ...options,
    providerRuntimePort: testProviderRuntime.providerRuntime,
    fakeProviderAdapter: testProviderRuntime.fakeAdapter,
  });
};

export const createScenarioStack = async (
  verifier = new FakeAdfPaySignatureVerifier(),
): Promise<PaymentFulfillmentGatewayStack> =>
  createTestPaymentFulfillmentGatewayStack({
    productReference: TEST_ADFPAY_PRODUCT_REFERENCE,
    paymentGatewayAdapter: new AdfPayPaymentGatewayAdapter({ signatureVerifier: verifier }),
  });

export { createAdfPayPaymentIngressInput, TEST_ADFPAY_PRODUCT_REFERENCE };
