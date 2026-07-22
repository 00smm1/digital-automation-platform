import type { PaymentConfirmation } from '../domain/payment-confirmation.js';
import { PaymentCorrelationFailure, type PaymentFailure } from '../domain/errors/payment-errors.js';
import {
  createPaymentCorrelationResult,
  type PaymentCorrelationResult,
} from '../domain/payment-authorization-result.js';
import { Result } from '@dap/core';
import type { CommerceOrderReadPort } from './commerce-order-read-port.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PaymentCorrelationService {
  private readonly commerceOrderReadPort: CommerceOrderReadPort;

  constructor(dependencies: { readonly commerceOrderReadPort: CommerceOrderReadPort }) {
    this.commerceOrderReadPort = dependencies.commerceOrderReadPort;
  }

  async correlate(
    confirmation: PaymentConfirmation,
  ): Promise<Result<PaymentCorrelationResult, PaymentFailure>> {
    const externalOrderReference = confirmation.externalOrderReference.trim();

    if (externalOrderReference.length === 0) {
      return Result.fail(
        new PaymentCorrelationFailure('Payment is missing an external order reference.'),
      );
    }

    if (EMAIL_PATTERN.test(externalOrderReference)) {
      return Result.fail(
        new PaymentCorrelationFailure('Payment correlation must use a stable order reference.'),
      );
    }

    const commerceOrder =
      await this.commerceOrderReadPort.findByExternalOrderReference(externalOrderReference);

    if (commerceOrder === null) {
      return Result.fail(
        new PaymentCorrelationFailure(
          `No commerce order exists for reference "${externalOrderReference}".`,
        ),
      );
    }

    return Result.ok(createPaymentCorrelationResult(commerceOrder));
  }
}
