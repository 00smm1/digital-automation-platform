import { describe, expect, it } from 'vitest';

import { parseAdfPayPaymentPayload } from '../parser/adfpay-payment-payload-parser.js';
import {
  createAdfPayPaymentIngressInput,
  createAdfPayPaymentPayload,
} from '../fixtures/adfpay-payment-fixtures.js';
import { AdfPayPaymentGatewayAdapter } from '../adapter/adfpay-payment-gateway-adapter.js';
import { FakeAdfPaySignatureVerifier } from '../signature/fake-adfpay-signature-verifier.js';

describe('AdfPayPaymentGatewayAdapter', () => {
  it('normalizes confirmed payments and preserves references', async () => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const result = await adapter.normalize(createAdfPayPaymentIngressInput());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(String(result.value.paymentReference)).toBe('pay-1001');
      expect(result.value.externalOrderReference).toBe('1001');
      expect(result.value.status).toBe('confirmed');
      expect(result.value.paymentSource).toContain('adfpay:');
    }
  });

  it('rejects malformed payloads and missing order reference', async () => {
    const adapter = new AdfPayPaymentGatewayAdapter({
      signatureVerifier: new FakeAdfPaySignatureVerifier(),
    });
    const input = createAdfPayPaymentIngressInput();
    const malformed = await adapter.normalize({ ...input, rawBody: '{invalid' });
    const missingOrder = await adapter.normalize({
      ...input,
      rawBody: JSON.stringify({ ...createAdfPayPaymentPayload(), order_id: '' }),
    });

    expect(malformed.ok).toBe(false);
    expect(missingOrder.ok).toBe(false);
  });

  it('maps parser output without embedding raw payload in failures', async () => {
    expect(() => parseAdfPayPaymentPayload({ payment_id: 'x' })).toThrow();
  });
});
