import { randomUUID } from 'node:crypto';

import type { Clock } from '../../shared/time/clock.js';
import {
  createPositiveInventoryQuantity,
  type InventoryQuantity,
} from '../../domain/inventory/inventory-quantity.js';
import type {
  InventoryItemReference,
  ReservationOwnerReference,
  ReservationReference,
} from '../../domain/inventory/inventory-references.js';
import { createReservationReference } from '../../domain/inventory/inventory-references.js';
import type { SafeInventoryMetadata } from '../../domain/inventory/quantity-inventory-record.js';
import { Result } from '../../shared/types/result.js';
import { InvalidInventoryQuantityError } from '../../domain/inventory/errors/reservation-errors.js';

export type ReservationPolicyConfig = {
  readonly defaultReservationDurationMs: number;
  readonly maximumReservationDurationMs: number;
};

export const DEFAULT_RESERVATION_POLICY_CONFIG: ReservationPolicyConfig = {
  defaultReservationDurationMs: 15 * 60 * 1000,
  maximumReservationDurationMs: 24 * 60 * 60 * 1000,
};

export type ValidatedReservationRequest = {
  readonly reservationReference: ReservationReference;
  readonly ownerReference: ReservationOwnerReference;
  readonly inventoryItemReference: InventoryItemReference;
  readonly quantity: InventoryQuantity;
  readonly expiresAt: Date;
  readonly externalOrderReference?: string;
  readonly metadata?: SafeInventoryMetadata;
};

export type ReservationPolicyValidationError = {
  readonly code:
    | 'invalid-owner-reference'
    | 'invalid-inventory-reference'
    | 'invalid-reservation-reference'
    | 'invalid-quantity'
    | 'invalid-expiration';
  readonly reasonCode: string;
};

export class ReservationPolicy {
  private readonly config: ReservationPolicyConfig;

  constructor(config: ReservationPolicyConfig = DEFAULT_RESERVATION_POLICY_CONFIG) {
    this.config = config;
  }

  validateReserveRequest(params: {
    readonly reservationReference: string;
    readonly ownerReference: string;
    readonly inventoryItemReference: string;
    readonly quantity: unknown;
    readonly reservationDurationMs?: number;
    readonly expiresAt?: Date;
    readonly clock: Clock;
    readonly externalOrderReference?: string;
    readonly metadata?: SafeInventoryMetadata;
  }): Result<ValidatedReservationRequest, ReservationPolicyValidationError> {
    if (params.ownerReference.trim().length === 0) {
      return Result.fail({ code: 'invalid-owner-reference', reasonCode: 'empty-owner' });
    }

    if (params.inventoryItemReference.trim().length === 0) {
      return Result.fail({ code: 'invalid-inventory-reference', reasonCode: 'empty-item' });
    }

    if (params.reservationReference.trim().length === 0) {
      return Result.fail({ code: 'invalid-reservation-reference', reasonCode: 'empty-reference' });
    }

    const quantityResult = createPositiveInventoryQuantity(params.quantity);

    if (!quantityResult.ok) {
      return Result.fail({ code: 'invalid-quantity', reasonCode: quantityResult.error.reasonCode });
    }

    const expiresAtResult = this.resolveExpiresAt(params);

    if (!expiresAtResult.ok) {
      return Result.fail(expiresAtResult.error);
    }

    return Result.ok({
      reservationReference: params.reservationReference as ReservationReference,
      ownerReference: params.ownerReference as ReservationOwnerReference,
      inventoryItemReference: params.inventoryItemReference as InventoryItemReference,
      quantity: quantityResult.value,
      expiresAt: expiresAtResult.value,
      externalOrderReference: params.externalOrderReference,
      metadata: params.metadata,
    });
  }

  private resolveExpiresAt(params: {
    readonly reservationDurationMs?: number;
    readonly expiresAt?: Date;
    readonly clock: Clock;
  }): Result<Date, ReservationPolicyValidationError> {
    const now = params.clock.now();

    if (params.expiresAt !== undefined) {
      if (!(params.expiresAt instanceof Date) || Number.isNaN(params.expiresAt.getTime())) {
        return Result.fail({ code: 'invalid-expiration', reasonCode: 'invalid-date' });
      }

      if (params.expiresAt.getTime() <= now.getTime()) {
        return Result.fail({ code: 'invalid-expiration', reasonCode: 'expires-before-now' });
      }

      const durationMs = params.expiresAt.getTime() - now.getTime();

      if (durationMs > this.config.maximumReservationDurationMs) {
        return Result.fail({ code: 'invalid-expiration', reasonCode: 'exceeds-maximum-duration' });
      }

      return Result.ok(new Date(params.expiresAt.getTime()));
    }

    const durationMs = params.reservationDurationMs ?? this.config.defaultReservationDurationMs;

    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      return Result.fail({ code: 'invalid-expiration', reasonCode: 'invalid-duration' });
    }

    if (durationMs > this.config.maximumReservationDurationMs) {
      return Result.fail({ code: 'invalid-expiration', reasonCode: 'exceeds-maximum-duration' });
    }

    return Result.ok(new Date(now.getTime() + durationMs));
  }

  validateExpirationInstant(value: unknown): Result<Date, { readonly reasonCode: string }> {
    if (!(value instanceof Date)) {
      return Result.fail({ reasonCode: 'invalid-date-type' });
    }

    if (Number.isNaN(value.getTime())) {
      return Result.fail({ reasonCode: 'invalid-date-value' });
    }

    return Result.ok(new Date(value.getTime()));
  }
}

export type ReservationReferenceFactory = {
  create(): ReservationReference;
};

/** Test-only deterministic reservation reference factory. */
export class DeterministicReservationReferenceFactory implements ReservationReferenceFactory {
  private counter = 0;
  private readonly prefix: string;

  constructor(prefix = 'reservation') {
    this.prefix = prefix;
  }

  create(): ReservationReference {
    this.counter += 1;
    return createReservationReference(`${this.prefix}-${this.counter}`);
  }
}

/** Composition-scoped sequential reservation reference factory. */
export class SequentialReservationReferenceFactory implements ReservationReferenceFactory {
  private counter = 0;
  private readonly namespace: string;

  constructor(namespace: string) {
    if (namespace.trim().length === 0) {
      throw new Error('Reservation reference factory namespace is required.');
    }

    this.namespace = namespace;
  }

  create(): ReservationReference {
    this.counter += 1;
    return createReservationReference(`${this.namespace}-${this.counter}`);
  }
}

export const createCompositionReservationReferenceFactory = (): ReservationReferenceFactory =>
  new SequentialReservationReferenceFactory(`res-${randomUUID()}`);

export { InvalidInventoryQuantityError };
