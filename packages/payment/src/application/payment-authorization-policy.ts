import type { PaymentConfirmation } from '../domain/payment-confirmation.js';
import type { PaymentRecord } from '../domain/payment-record.js';
import type { CommerceOrderRecord } from '../domain/commerce-order-record.js';
import {
  createPaymentAuthorizationResult,
  type PaymentAuthorizationResult,
} from '../domain/payment-authorization-result.js';
import { isAuthorizedPaymentStatus } from '../domain/payment-status.js';
import { moneyEquals } from '../domain/money.js';

export class PaymentAuthorizationPolicy {
  async evaluate(params: {
    readonly confirmation: PaymentConfirmation;
    readonly commerceOrder: CommerceOrderRecord;
    readonly existingByPaymentReference: PaymentRecord | null;
    readonly existingConfirmedByOrder: PaymentRecord | null;
  }): Promise<PaymentAuthorizationResult> {
    const { confirmation, commerceOrder, existingByPaymentReference, existingConfirmedByOrder } =
      params;

    if (existingByPaymentReference !== null) {
      if (
        existingByPaymentReference.externalOrderReference !== confirmation.externalOrderReference
      ) {
        return createPaymentAuthorizationResult({
          decision: 'conflict',
          authorized: false,
          reasonCode: 'PAYMENT_CONFLICT',
          reasonMessage: `Payment reference "${String(confirmation.paymentReference)}" is already associated with a different order.`,
        });
      }

      return createPaymentAuthorizationResult({
        decision: 'duplicate',
        authorized: false,
        reasonCode: 'DUPLICATE_PAYMENT',
        reasonMessage: `Payment reference "${String(confirmation.paymentReference)}" has already been processed.`,
      });
    }

    if (
      existingConfirmedByOrder !== null &&
      String(existingConfirmedByOrder.paymentReference) !== String(confirmation.paymentReference)
    ) {
      return createPaymentAuthorizationResult({
        decision: 'conflict',
        authorized: false,
        reasonCode: 'ALREADY_CONFIRMED',
        reasonMessage: `Order "${confirmation.externalOrderReference}" already has a confirmed payment.`,
      });
    }

    if (!isAuthorizedPaymentStatus(confirmation.status)) {
      return createPaymentAuthorizationResult({
        decision: 'rejected',
        authorized: false,
        reasonCode: 'AUTHORIZATION_REJECTED',
        reasonMessage: `Payment status "${confirmation.status}" does not authorize fulfillment.`,
      });
    }

    const amountValidation = this.validateMoney(confirmation, commerceOrder);

    if (amountValidation !== undefined) {
      return amountValidation;
    }

    return createPaymentAuthorizationResult({
      decision: 'authorized',
      authorized: true,
      reasonCode: 'AUTHORIZED',
      reasonMessage: `Payment "${String(confirmation.paymentReference)}" authorizes fulfillment for order "${confirmation.externalOrderReference}".`,
    });
  }

  private validateMoney(
    confirmation: PaymentConfirmation,
    commerceOrder: CommerceOrderRecord,
  ): PaymentAuthorizationResult | undefined {
    if (confirmation.money === undefined || commerceOrder.expectedAmount === undefined) {
      return undefined;
    }

    if (confirmation.money.currency !== commerceOrder.expectedAmount.currency) {
      return createPaymentAuthorizationResult({
        decision: 'rejected',
        authorized: false,
        reasonCode: 'CURRENCY_MISMATCH',
        reasonMessage: `Payment currency does not match the expected order currency for "${confirmation.externalOrderReference}".`,
      });
    }

    if (!moneyEquals(confirmation.money, commerceOrder.expectedAmount)) {
      return createPaymentAuthorizationResult({
        decision: 'rejected',
        authorized: false,
        reasonCode: 'AMOUNT_MISMATCH',
        reasonMessage: `Payment amount does not match the expected order amount for "${confirmation.externalOrderReference}".`,
      });
    }

    return undefined;
  }
}
