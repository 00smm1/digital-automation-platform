import { describe, expect, it } from 'vitest';

import {
  parseAdfPayPaymentPayload,
  safeParseAdfPayPaymentPayload,
} from './adfpay-payment-payload-parser.js';
import { createAdfPayPaymentPayload } from '../fixtures/adfpay-payment-fixtures.js';
import { AdfPayAdapterError } from '../errors/adfpay-adapter-errors.js';

describe('AdfPay payment payload parser', () => {
  it('[S17][S18] rejects malformed payload with safe typed failure', () => {
    const result = safeParseAdfPayPaymentPayload(null);

    expect(result).toBeInstanceOf(AdfPayAdapterError);

    if (result instanceof AdfPayAdapterError) {
      expect(result.failureCode).toBe('MALFORMED_PAYLOAD');
    }
  });

  it('[S20] rejects missing external payment reference', () => {
    expect(() =>
      parseAdfPayPaymentPayload({ ...createAdfPayPaymentPayload(), payment_id: '' }),
    ).toThrow(AdfPayAdapterError);
  });

  it('[S21] rejects missing external order reference', () => {
    expect(() =>
      parseAdfPayPaymentPayload({ ...createAdfPayPaymentPayload(), order_id: '' }),
    ).toThrow(AdfPayAdapterError);
  });

  it('[S22] rejects unsupported payment status', () => {
    expect(() =>
      parseAdfPayPaymentPayload({ ...createAdfPayPaymentPayload(), status: 'unknown-status' }),
    ).toThrow(AdfPayAdapterError);
  });

  it('[S23] rejects invalid timestamp', () => {
    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        occurred_at: 'not-a-date',
      }),
    ).toThrow(AdfPayAdapterError);
  });

  it('[S62][S63][S64] rejects invalid monetary values', () => {
    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        amount_minor_units: -1,
      }),
    ).toThrow(AdfPayAdapterError);

    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        currency: 'US',
      }),
    ).toThrow(AdfPayAdapterError);
  });

  it('does not parse fulfillment product or quantity fields', () => {
    const parsed = parseAdfPayPaymentPayload(
      createAdfPayPaymentPayload({
        productReference: 'malicious-product',
        quantity: 99,
        customerId: 'attacker',
      }),
    );

    expect(parsed).not.toHaveProperty('productReference');
    expect(parsed).not.toHaveProperty('quantity');
    expect(parsed).not.toHaveProperty('customerReference');
  });
});

describe('AdfPay strict monetary integer parsing', () => {
  it('accepts valid integer string minor units', () => {
    const parsed = parseAdfPayPaymentPayload({
      ...createAdfPayPaymentPayload(),
      amount_minor_units: '4900',
    });

    expect(parsed.money?.amountMinorUnits).toBe(4900);
  });

  it('accepts valid numeric integer minor units', () => {
    const parsed = parseAdfPayPaymentPayload({
      ...createAdfPayPaymentPayload(),
      amount_minor_units: 4900,
    });

    expect(parsed.money?.amountMinorUnits).toBe(4900);
  });

  it.each(['100abc', '12.7', '1e3', '', '   '])(
    'rejects invalid string minor units "%s"',
    (amountMinorUnits) => {
      expect(() =>
        parseAdfPayPaymentPayload({
          ...createAdfPayPaymentPayload(),
          amount_minor_units: amountMinorUnits,
        }),
      ).toThrow(AdfPayAdapterError);
    },
  );

  it('rejects negative numeric minor units', () => {
    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        amount_minor_units: -1,
      }),
    ).toThrow(AdfPayAdapterError);
  });

  it('rejects unsafe integer minor units', () => {
    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        amount_minor_units: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(AdfPayAdapterError);

    expect(() =>
      parseAdfPayPaymentPayload({
        ...createAdfPayPaymentPayload(),
        amount_minor_units: `${Number.MAX_SAFE_INTEGER + 1}`,
      }),
    ).toThrow(AdfPayAdapterError);
  });
});
