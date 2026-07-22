import { describe, expect, it } from 'vitest';

import { createMoney, moneyEquals } from '../domain/money.js';
import { PaymentAuthorizationPolicy } from '../application/payment-authorization-policy.js';
import { createPaymentConfirmation } from '../domain/payment-confirmation.js';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import { createCommerceOrderRecord } from '../domain/commerce-order-record.js';

const createConfirmation = (
  overrides: {
    status?: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'refunded';
    orderId?: string;
    paymentId?: string;
    amountMinorUnits?: number;
    currency?: string;
  } = {},
) =>
  createPaymentConfirmation({
    paymentReference: createPaymentReference(overrides.paymentId ?? 'pay-1001')!,
    externalOrderReference: overrides.orderId ?? '1001',
    paymentSource: createPaymentSource('adfpay:lord-tv')!,
    status: overrides.status ?? 'confirmed',
    occurredAt: new Date('2026-07-21T08:00:00.000Z'),
    externalEventId: 'pay-event-1001',
    money: createMoney({
      amountMinorUnits: overrides.amountMinorUnits ?? 4900,
      currency: overrides.currency ?? 'USD',
    }),
    metadata: {},
  });

const createCommerceOrder = (
  overrides: {
    orderId?: string;
    amountMinorUnits?: number;
    currency?: string;
  } = {},
) =>
  createCommerceOrderRecord({
    externalOrderReference: overrides.orderId ?? '1001',
    productReference: '99001',
    quantity: 1,
    customerReference: '4242',
    customerEmail: 'customer@example.com',
    expectedAmount: createMoney({
      amountMinorUnits: overrides.amountMinorUnits ?? 4900,
      currency: overrides.currency ?? 'USD',
    }),
  });

describe('Money', () => {
  it('represents amount without floating point equality', () => {
    const money = createMoney({ amountMinorUnits: 4900, currency: 'usd' });
    expect(money).toEqual({ amountMinorUnits: 4900, currency: 'USD' });
    expect(moneyEquals(money!, createMoney({ amountMinorUnits: 4900, currency: 'USD' })!)).toBe(
      true,
    );
  });

  it('rejects invalid monetary values', () => {
    expect(createMoney({ amountMinorUnits: 1.5, currency: 'USD' })).toBeUndefined();
    expect(createMoney({ amountMinorUnits: -1, currency: 'USD' })).toBeUndefined();
    expect(createMoney({ amountMinorUnits: 100, currency: 'US' })).toBeUndefined();
  });
});

describe('PaymentAuthorizationPolicy', () => {
  it.each([
    ['confirmed', true, 'authorized'],
    ['pending', false, 'rejected'],
    ['failed', false, 'rejected'],
    ['cancelled', false, 'rejected'],
    ['refunded', false, 'rejected'],
  ] as const)(
    'returns %s authorization decision for status %s',
    async (status, authorized, decision) => {
      const policy = new PaymentAuthorizationPolicy();
      const result = await policy.evaluate({
        confirmation: createConfirmation({ status }),
        commerceOrder: createCommerceOrder(),
        existingByPaymentReference: null,
        existingConfirmedByOrder: null,
      });

      expect(result.authorized).toBe(authorized);
      expect(result.decision).toBe(decision);
    },
  );

  it('rejects amount mismatch when expected order amount exists', async () => {
    const policy = new PaymentAuthorizationPolicy();
    const result = await policy.evaluate({
      confirmation: createConfirmation({ orderId: '1002', amountMinorUnits: 4900 }),
      commerceOrder: createCommerceOrder({ orderId: '1002', amountMinorUnits: 5000 }),
      existingByPaymentReference: null,
      existingConfirmedByOrder: null,
    });

    expect(result.reasonCode).toBe('AMOUNT_MISMATCH');
    expect(result.authorized).toBe(false);
  });

  it('documents deferred amount validation when order amount is unavailable', async () => {
    const policy = new PaymentAuthorizationPolicy();
    const result = await policy.evaluate({
      confirmation: createConfirmation(),
      commerceOrder: createCommerceOrderRecord({
        externalOrderReference: '1001',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
      existingByPaymentReference: null,
      existingConfirmedByOrder: null,
    });

    expect(result.authorized).toBe(true);
  });
});

describe('PaymentConfirmation immutability', () => {
  it('clones Date values on creation', () => {
    const occurredAt = new Date('2026-07-21T08:00:00.000Z');
    const confirmation = createConfirmation();
    const originalTime = confirmation.occurredAt.getTime();
    occurredAt.setTime(originalTime + 60_000);

    expect(confirmation.occurredAt.getTime()).toBe(originalTime);
  });

  it('returns independent metadata copies for each confirmation', () => {
    const first = createPaymentConfirmation({
      paymentReference: createPaymentReference('pay-meta')!,
      externalOrderReference: '1001',
      paymentSource: createPaymentSource('adfpay:lord-tv')!,
      status: 'confirmed',
      occurredAt: new Date('2026-07-21T08:00:00.000Z'),
      externalEventId: 'evt-meta',
      metadata: { gatewayEventType: 'payment.updated' },
    });
    const second = createPaymentConfirmation({
      paymentReference: createPaymentReference('pay-meta-2')!,
      externalOrderReference: '1001',
      paymentSource: createPaymentSource('adfpay:lord-tv')!,
      status: 'confirmed',
      occurredAt: new Date('2026-07-21T08:00:00.000Z'),
      externalEventId: 'evt-meta-2',
      metadata: { gatewayEventType: 'payment.updated' },
    });

    expect(first.metadata).not.toBe(second.metadata);
    (first.metadata as { gatewayEventType: string }).gatewayEventType = 'mutated';
    expect(second.metadata.gatewayEventType).toBe('payment.updated');
  });
});
