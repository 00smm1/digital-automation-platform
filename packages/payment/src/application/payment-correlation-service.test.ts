import { describe, expect, it } from 'vitest';

import { PaymentCorrelationService } from './payment-correlation-service.js';
import { InMemoryCommerceOrderReadPort } from './commerce-order-read-port.js';
import { createPaymentConfirmation } from '../domain/payment-confirmation.js';
import { createPaymentReference } from '../domain/payment-reference.js';
import { createPaymentSource } from '../domain/payment-source.js';
import { createMoney } from '../domain/money.js';
import { createCommerceOrderRecord } from '../domain/commerce-order-record.js';

const createConfirmation = (
  overrides: {
    orderId?: string;
    amountMinorUnits?: number;
  } = {},
) =>
  createPaymentConfirmation({
    paymentReference: createPaymentReference('pay-1001')!,
    externalOrderReference: overrides.orderId ?? '1001',
    paymentSource: createPaymentSource('adfpay:lord-tv')!,
    status: 'confirmed',
    occurredAt: new Date('2026-07-21T08:00:00.000Z'),
    externalEventId: 'evt-1',
    money: createMoney({ amountMinorUnits: overrides.amountMinorUnits ?? 4900, currency: 'USD' }),
    metadata: {},
  });

describe('PaymentCorrelationService', () => {
  it('[S25][S6] correlates to an existing commerce order by external order reference', async () => {
    const commerceOrderReadPort = new InMemoryCommerceOrderReadPort();
    commerceOrderReadPort.save(
      createCommerceOrderRecord({
        externalOrderReference: '5001',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
    );
    const service = new PaymentCorrelationService({ commerceOrderReadPort });
    const result = await service.correlate(createConfirmation({ orderId: '5001' }));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.commerceOrder.externalOrderReference).toBe('5001');
      expect(result.value.commerceOrder.productReference).toBe('99001');
    }
  });

  it('[S5] rejects when no commerce order exists', async () => {
    const service = new PaymentCorrelationService({
      commerceOrderReadPort: new InMemoryCommerceOrderReadPort(),
    });
    const result = await service.correlate(createConfirmation({ orderId: 'missing-order' }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.failureCode).toBe('CORRELATION_FAILED');
    }
  });

  it('[S26] missing order correlation prevents fulfillment', async () => {
    const service = new PaymentCorrelationService({
      commerceOrderReadPort: new InMemoryCommerceOrderReadPort(),
    });
    const result = await service.correlate(createConfirmation({ orderId: '   ' }));

    expect(result.ok).toBe(false);
  });

  it('[S27][S7] rejects email-only correlation attempts', async () => {
    const service = new PaymentCorrelationService({
      commerceOrderReadPort: new InMemoryCommerceOrderReadPort(),
    });
    const result = await service.correlate(createConfirmation({ orderId: 'customer@example.com' }));

    expect(result.ok).toBe(false);
  });

  it('[S28][S8][S68] does not use payment amount as a correlation key', async () => {
    const commerceOrderReadPort = new InMemoryCommerceOrderReadPort();
    commerceOrderReadPort.save(
      createCommerceOrderRecord({
        externalOrderReference: '6001',
        productReference: '99001',
        quantity: 1,
        customerReference: '4242',
      }),
    );
    const service = new PaymentCorrelationService({ commerceOrderReadPort });
    const first = await service.correlate(
      createConfirmation({ orderId: '6001', amountMinorUnits: 4900 }),
    );
    const second = await service.correlate(
      createConfirmation({ orderId: '6001', amountMinorUnits: 9999 }),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (first.ok && second.ok) {
      expect(first.value.commerceOrder.externalOrderReference).toBe('6001');
      expect(second.value.commerceOrder.externalOrderReference).toBe('6001');
    }
  });
});
