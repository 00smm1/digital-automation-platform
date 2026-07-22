import { describe, expect, it } from 'vitest';

import { InMemoryPaymentRepository } from '../domain/in-memory-payment-repository.js';
import { createPaymentConfirmation } from '../domain/payment-confirmation.js';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import { createMoney } from '../domain/money.js';
import { PaymentCorrelationService } from '../application/payment-correlation-service.js';

const createConfirmation = (overrides: Partial<{ orderId: string; paymentId: string }> = {}) =>
  createPaymentConfirmation({
    paymentReference: createPaymentReference(overrides.paymentId ?? 'pay-1001')!,
    externalOrderReference: overrides.orderId ?? '1001',
    paymentSource: createPaymentSource('adfpay:lord-tv')!,
    status: 'confirmed',
    occurredAt: new Date('2026-07-21T08:00:00.000Z'),
    externalEventId: 'evt-1',
    money: createMoney({ amountMinorUnits: 4900, currency: 'USD' }),
    metadata: {},
  });

describe('InMemoryPaymentRepository', () => {
  it('creates immutable records and rejects duplicate payment references', async () => {
    const repository = new InMemoryPaymentRepository();
    const record = InMemoryPaymentRepository.createRecordFromConfirmation(createConfirmation());
    const created = await repository.create(record);

    expect(created.ok).toBe(true);

    const duplicate = await repository.create(record);
    expect(duplicate.ok).toBe(false);
  });

  it('returns immutable copies that do not mutate internal state', async () => {
    const repository = new InMemoryPaymentRepository();
    const created = await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(createConfirmation()),
    );

    expect(created.ok).toBe(true);

    if (created.ok) {
      const copy = { ...created.value, externalOrderReference: 'mutated' };
      expect(copy.externalOrderReference).toBe('mutated');
      const found = await repository.findByPaymentReference(createPaymentReference('pay-1001')!);
      expect(found?.externalOrderReference).toBe('1001');
    }
  });
});

describe('PaymentCorrelationService', () => {
  it('requires a commerce order record and does not use payment payload fields', async () => {
    const service = new PaymentCorrelationService({
      commerceOrderReadPort: {
        findByExternalOrderReference: async () => null,
      },
    });
    const result = await service.correlate(createConfirmation());

    expect(result.ok).toBe(false);
  });
});
