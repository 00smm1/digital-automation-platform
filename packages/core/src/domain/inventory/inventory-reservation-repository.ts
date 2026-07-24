import type { Clock } from '../../shared/time/clock.js';
import type { InventoryReservation } from './inventory-reservation.js';
import type { QuantityInventoryRecord } from './quantity-inventory-record.js';
import type {
  InventoryItemReference,
  ReservationOwnerReference,
  ReservationReference,
} from './inventory-references.js';
import type { InventoryQuantity } from './inventory-quantity.js';
import type { SafeInventoryMetadata } from './quantity-inventory-record.js';

export type ReservationRequestRecord = {
  readonly reservationReference: ReservationReference;
  readonly ownerReference: ReservationOwnerReference;
  readonly inventoryItemReference: InventoryItemReference;
  readonly quantity: InventoryQuantity;
  readonly expiresAt: Date;
  readonly externalOrderReference?: string;
  readonly metadata?: SafeInventoryMetadata;
};

export type TryReserveResult =
  | {
      readonly kind: 'reserved';
      readonly reservation: InventoryReservation;
      readonly inventoryItem: QuantityInventoryRecord;
    }
  | {
      readonly kind: 'duplicate';
      readonly reservation: InventoryReservation;
    }
  | {
      readonly kind: 'conflict';
      readonly reasonCode: string;
    }
  | {
      readonly kind: 'insufficient-inventory';
    }
  | {
      readonly kind: 'inventory-item-not-found';
    }
  | {
      readonly kind: 'repository-failed';
      readonly reasonCode: string;
    };

export type ReservationTransitionKind = 'consume' | 'release' | 'expire';

export type TransitionReservationResult =
  | {
      readonly kind: 'transitioned';
      readonly reservation: InventoryReservation;
      readonly inventoryItem: QuantityInventoryRecord;
    }
  | {
      readonly kind: 'idempotent';
      readonly reservation: InventoryReservation;
      readonly inventoryItem: QuantityInventoryRecord;
    }
  | {
      readonly kind: 'invalid-transition';
      readonly reasonCode: string;
      readonly reservation: InventoryReservation;
    }
  | {
      readonly kind: 'reservation-not-found';
    }
  | {
      readonly kind: 'repository-failed';
      readonly reasonCode: string;
    };

export type InventoryReservationRepositoryContext = {
  readonly clock: Clock;
};

/**
 * Provider-neutral reservation repository.
 *
 * Concurrency contract:
 * `tryReserve` and transition operations MUST be atomic per inventory item.
 * Production persistence must provide equivalent transactional or compare-and-set behavior.
 */
export interface InventoryReservationRepository {
  saveInventoryItem(item: QuantityInventoryRecord): Promise<void>;

  findInventoryItemByReference(
    inventoryItemReference: InventoryItemReference,
  ): Promise<QuantityInventoryRecord | null>;

  findReservationByReference(
    reservationReference: ReservationReference,
  ): Promise<InventoryReservation | null>;

  findReservationByOwnerKey(params: {
    readonly ownerReference: ReservationOwnerReference;
    readonly inventoryItemReference: InventoryItemReference;
  }): Promise<InventoryReservation | null>;

  tryReserve(
    request: ReservationRequestRecord,
    context: InventoryReservationRepositoryContext,
  ): Promise<TryReserveResult>;

  transitionReservation(params: {
    readonly reservationReference: ReservationReference;
    readonly transition: ReservationTransitionKind;
    readonly context: InventoryReservationRepositoryContext;
  }): Promise<TransitionReservationResult>;

  findReservedReservationsDue(params: {
    readonly now: Date;
  }): Promise<readonly InventoryReservation[]>;
}
