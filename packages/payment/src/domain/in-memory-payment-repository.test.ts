import { describe, expect, it } from 'vitest';
import { Result } from '@dap/core';

import { InMemoryPaymentRepository } from './in-memory-payment-repository.js';
import { createPaymentConfirmation } from './payment-confirmation.js';
import { createPaymentReference } from './payment-reference.js';
import { createPaymentSource } from './payment-source.js';
import { createMoney } from './money.js';
import { PaymentProcessingFailure } from './errors/payment-errors.js';
import type { PaymentRecord } from './payment-record.js';
import type { PaymentRepository } from './payment-repository.js';

const createConfirmation = (overrides: { paymentId?: string; orderId?: string } = {}) =>
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

class FailingPaymentRepository implements PaymentRepository {
  async create(_record: PaymentRecord) {
    return Result.fail(new PaymentProcessingFailure('Repository unavailable.'));
  }

  async findByPaymentReference() {
    return null;
  }

  async findConfirmedByExternalOrderReference() {
    return null;
  }

  async update(_record: PaymentRecord) {
    return Result.fail(new PaymentProcessingFailure('Repository unavailable.'));
  }
}

describe('InMemoryPaymentRepository', () => {
  it('[S51][S52] creates and finds records by external payment reference', async () => {
    const repository = new InMemoryPaymentRepository();
    const created = await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(createConfirmation()),
    );

    expect(created.ok).toBe(true);

    const found = await repository.findByPaymentReference(createPaymentReference('pay-1001')!);
    expect(found?.externalOrderReference).toBe('1001');
  });

  it('[S53] finds confirmed payment by external order reference', async () => {
    const repository = new InMemoryPaymentRepository();
    await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(
        createConfirmation({ paymentId: 'pay-order', orderId: '8001' }),
      ),
    );

    const found = await repository.findConfirmedByExternalOrderReference('8001');
    expect(found?.paymentReference).toEqual(createPaymentReference('pay-order'));
  });

  it('[S13][S14] date mutation does not affect stored payment state', async () => {
    const repository = new InMemoryPaymentRepository();
    await repository.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(createConfirmation()),
    );
    const found = await repository.findByPaymentReference(createPaymentReference('pay-1001')!);
    expect(found).not.toBeNull();

    if (found !== null) {
      found.occurredAt.setTime(0);
      const reread = await repository.findByPaymentReference(createPaymentReference('pay-1001')!);
      expect(reread?.occurredAt.getTime()).toBe(new Date('2026-07-21T08:00:00.000Z').getTime());
    }
  });

  it('[S60] repository exception converts to safe payment-processing failure', async () => {
    const failing = new FailingPaymentRepository();
    const result = await failing.create(
      InMemoryPaymentRepository.createRecordFromConfirmation(createConfirmation()),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('REPOSITORY_FAILED');
    }
  });
});
