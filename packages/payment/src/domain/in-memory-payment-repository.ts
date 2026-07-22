import { Result } from '@dap/core';
import { OrderFulfillmentAuthorizationError } from '@dap/core';
import type { OrderFulfillmentAuthorizationPort } from '@dap/core';

import {
  copyPaymentRecord,
  createPaymentRecordFromConfirmation,
  type PaymentRecord,
} from './payment-record.js';
import type { PaymentRepository } from './payment-repository.js';
import {
  DuplicatePaymentFailure,
  PaymentConflictFailure,
  PaymentProcessingFailure,
} from './errors/payment-errors.js';
import type { PaymentConfirmation } from './payment-confirmation.js';
import type { PaymentReference } from './payment-reference.js';

type OrderFulfillmentState = 'pending' | 'fulfilled';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly byPaymentReference = new Map<string, PaymentRecord>();
  private readonly confirmedByOrderReference = new Map<string, PaymentRecord>();
  private configuredUpdateError?: PaymentProcessingFailure;

  configureUpdateFailure(error: PaymentProcessingFailure): void {
    this.configuredUpdateError = error;
  }

  reset(): void {
    this.byPaymentReference.clear();
    this.confirmedByOrderReference.clear();
    this.configuredUpdateError = undefined;
  }

  async create(record: PaymentRecord) {
    const paymentKey = String(record.paymentReference);

    if (this.byPaymentReference.has(paymentKey)) {
      return Result.fail(new DuplicatePaymentFailure());
    }

    const existingConfirmed = this.confirmedByOrderReference.get(record.externalOrderReference);

    if (existingConfirmed !== undefined && record.status === 'confirmed') {
      if (String(existingConfirmed.paymentReference) !== paymentKey) {
        return Result.fail(
          new PaymentConflictFailure(
            `Order "${record.externalOrderReference}" already has a confirmed payment.`,
          ),
        );
      }
    }

    const stored = copyPaymentRecord(record);
    this.byPaymentReference.set(paymentKey, stored);

    if (stored.status === 'confirmed') {
      this.confirmedByOrderReference.set(stored.externalOrderReference, copyPaymentRecord(stored));
    }

    return Result.ok(copyPaymentRecord(stored));
  }

  async findByPaymentReference(paymentReference: PaymentReference) {
    const record = this.byPaymentReference.get(String(paymentReference));
    return record === undefined ? null : copyPaymentRecord(record);
  }

  async findConfirmedByExternalOrderReference(externalOrderReference: string) {
    const record = this.confirmedByOrderReference.get(externalOrderReference);
    return record === undefined ? null : copyPaymentRecord(record);
  }

  async update(record: PaymentRecord) {
    if (this.configuredUpdateError !== undefined) {
      return Result.fail(this.configuredUpdateError);
    }

    const paymentKey = String(record.paymentReference);
    const existing = this.byPaymentReference.get(paymentKey);

    if (existing === undefined) {
      return Result.fail(new PaymentProcessingFailure('Payment record was not found.'));
    }

    const stored = copyPaymentRecord(record);
    this.byPaymentReference.set(paymentKey, stored);

    if (stored.status === 'confirmed') {
      this.confirmedByOrderReference.set(stored.externalOrderReference, copyPaymentRecord(stored));
    }

    return Result.ok(copyPaymentRecord(stored));
  }

  getAllRecords(): readonly PaymentRecord[] {
    return [...this.byPaymentReference.values()].map((record) => copyPaymentRecord(record));
  }

  static createRecordFromConfirmation(
    confirmation: PaymentConfirmation,
    params: { readonly confirmedAt?: Date; readonly processedAt?: Date } = {},
  ): PaymentRecord {
    return createPaymentRecordFromConfirmation(confirmation, params);
  }
}

export class InMemoryOrderFulfillmentAuthorizationRegistry implements OrderFulfillmentAuthorizationPort {
  private readonly states = new Map<string, OrderFulfillmentState>();
  private configuredMarkFulfilledError?: OrderFulfillmentAuthorizationError;
  private configuredReleaseError?: OrderFulfillmentAuthorizationError;

  configureMarkFulfilledFailure(error: OrderFulfillmentAuthorizationError): void {
    this.configuredMarkFulfilledError = error;
  }

  configureReleaseFailure(error: OrderFulfillmentAuthorizationError): void {
    this.configuredReleaseError = error;
  }

  reset(): void {
    this.states.clear();
    this.configuredMarkFulfilledError = undefined;
    this.configuredReleaseError = undefined;
  }

  async tryAcquire(params: { readonly externalOrderReference: string }) {
    const existing = this.states.get(params.externalOrderReference);

    if (existing === 'fulfilled') {
      return Result.fail(
        new OrderFulfillmentAuthorizationError(
          `Order "${params.externalOrderReference}" has already been fulfilled.`,
          'ORDER_ALREADY_FULFILLED',
        ),
      );
    }

    if (existing === 'pending') {
      return Result.fail(
        new OrderFulfillmentAuthorizationError(
          `Order "${params.externalOrderReference}" fulfillment is already in progress.`,
          'ORDER_FULFILLMENT_IN_PROGRESS',
        ),
      );
    }

    this.states.set(params.externalOrderReference, 'pending');
    return Result.ok(undefined);
  }

  async markFulfilled(params: { readonly externalOrderReference: string }) {
    if (this.configuredMarkFulfilledError !== undefined) {
      return Result.fail(this.configuredMarkFulfilledError);
    }

    this.states.set(params.externalOrderReference, 'fulfilled');
    return Result.ok(undefined);
  }

  async release(params: { readonly externalOrderReference: string }) {
    if (this.configuredReleaseError !== undefined) {
      return Result.fail(this.configuredReleaseError);
    }

    const existing = this.states.get(params.externalOrderReference);

    if (existing === 'pending') {
      this.states.delete(params.externalOrderReference);
    }

    return Result.ok(undefined);
  }

  async isFulfilled(externalOrderReference: string) {
    return this.states.get(externalOrderReference) === 'fulfilled';
  }
}
