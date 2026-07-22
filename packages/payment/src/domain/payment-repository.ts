import type { Result } from '@dap/core';
import type { PaymentRecord } from './payment-record.js';
import type { PaymentReference } from './payment-reference.js';
import type { PaymentFailure } from './errors/payment-errors.js';

export type PaymentRepository = {
  create(record: PaymentRecord): Promise<Result<PaymentRecord, PaymentFailure>>;

  findByPaymentReference(paymentReference: PaymentReference): Promise<PaymentRecord | null>;

  findConfirmedByExternalOrderReference(
    externalOrderReference: string,
  ): Promise<PaymentRecord | null>;

  update(record: PaymentRecord): Promise<Result<PaymentRecord, PaymentFailure>>;
};
