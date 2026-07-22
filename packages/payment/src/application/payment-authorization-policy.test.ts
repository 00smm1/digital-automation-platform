import { describe, expect, it } from 'vitest';

import { PaymentAuthorizationPolicy } from './payment-authorization-policy.js';
import { InMemoryPaymentRepository } from '../domain/in-memory-payment-repository.js';
import { createPaymentConfirmation } from '../domain/payment-confirmation.js';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import { createMoney } from '../domain/money.js';
import { copyPaymentRecord } from '../domain/payment-record.js';
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
    externalEventId: 'evt-1',
    money: createMoney({
      amountMinorUnits: overrides.amountMinorUnits ?? 4900,
      currency: overrides.currency ?? 'USD',
    }),
    metadata: {},
  });

const createCommerceOrder = (orderId = '1001') =>
  createCommerceOrderRecord({
    externalOrderReference: orderId,
    productReference: '99001',
    quantity: 1,
    customerReference: '4242',
    customerEmail: 'customer@example.com',
    expectedAmount: createMoney({ amountMinorUnits: 4900, currency: 'USD' }),
  });

describe('PaymentAuthorizationPolicy conflicts and money validation', () => {
  it('[S30][S47] rejects same payment reference mapped to a different order', async () => {
    const repository = new InMemoryPaymentRepository();
    const policy = new PaymentAuthorizationPolicy();
    const existing = await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(
        createConfirmation({ paymentId: 'pay-x' }),
      ),
    );

    expect(existing.ok).toBe(true);

    const result = await policy.evaluate({
      confirmation: createConfirmation({ paymentId: 'pay-x', orderId: '9999' }),
      commerceOrder: createCommerceOrder('9999'),
      existingByPaymentReference: existing.ok ? existing.value : null,
      existingConfirmedByOrder: null,
    });

    expect(result.decision).toBe('conflict');
    expect(result.reasonCode).toBe('PAYMENT_CONFLICT');
    expect(result.authorized).toBe(false);
  });

  it('[S31][S48] rejects different confirmed payment for an already-confirmed order', async () => {
    const repository = new InMemoryPaymentRepository();
    const policy = new PaymentAuthorizationPolicy();
    await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(
        createConfirmation({ paymentId: 'pay-first', orderId: '2001' }),
      ),
    );
    const existingConfirmed = await repository.findConfirmedByExternalOrderReference('2001');

    const result = await policy.evaluate({
      confirmation: createConfirmation({ paymentId: 'pay-second', orderId: '2001' }),
      commerceOrder: createCommerceOrder('2001'),
      existingByPaymentReference: null,
      existingConfirmedByOrder: existingConfirmed,
    });

    expect(result.decision).toBe('conflict');
    expect(result.reasonCode).toBe('ALREADY_CONFIRMED');
    expect(result.authorized).toBe(false);
  });

  it('[S67] rejects currency mismatch when expected order amount exists', async () => {
    const policy = new PaymentAuthorizationPolicy();
    const result = await policy.evaluate({
      confirmation: createConfirmation({
        orderId: '3001',
        amountMinorUnits: 4900,
        currency: 'USD',
      }),
      commerceOrder: createCommerceOrderRecord({
        externalOrderReference: '3001',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
        expectedAmount: createMoney({ amountMinorUnits: 4900, currency: 'EUR' }),
      }),
      existingByPaymentReference: null,
      existingConfirmedByOrder: null,
    });

    expect(result.reasonCode).toBe('CURRENCY_MISMATCH');
    expect(result.authorized).toBe(false);
  });

  it('[S41][S42] returns deterministic duplicate decision for same payment reference', async () => {
    const repository = new InMemoryPaymentRepository();
    const policy = new PaymentAuthorizationPolicy();
    const record = InMemoryPaymentRepository.createRecordFromConfirmation(
      createConfirmation({ paymentId: 'pay-dup' }),
    );
    await repository.create(record);

    const result = await policy.evaluate({
      confirmation: createConfirmation({ paymentId: 'pay-dup' }),
      commerceOrder: createCommerceOrder(),
      existingByPaymentReference: copyPaymentRecord(record),
      existingConfirmedByOrder: null,
    });

    expect(result.decision).toBe('duplicate');
    expect(result.reasonCode).toBe('DUPLICATE_PAYMENT');
    expect(result.authorized).toBe(false);
  });
});
