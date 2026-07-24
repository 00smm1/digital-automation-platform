import type {
  InventoryItemReference,
  ReservationOwnerReference,
  ReservationReference,
} from './inventory-references.js';
import type { InventoryQuantity } from './inventory-quantity.js';
import type { ReservationStatus } from './reservation-status.js';
import type { SafeInventoryMetadata } from './quantity-inventory-record.js';

export type InventoryReservation = {
  readonly reservationReference: ReservationReference;
  readonly ownerReference: ReservationOwnerReference;
  readonly inventoryItemReference: InventoryItemReference;
  readonly quantity: InventoryQuantity;
  readonly status: ReservationStatus;
  readonly reservedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt?: Date;
  readonly releasedAt?: Date;
  readonly expiredAt?: Date;
  readonly externalOrderReference?: string;
  readonly version: number;
  readonly metadata?: SafeInventoryMetadata;
};

const cloneDate = (value: Date | undefined): Date | undefined =>
  value === undefined ? undefined : new Date(value.getTime());

const cloneMetadata = (
  metadata: SafeInventoryMetadata | undefined,
): SafeInventoryMetadata | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  return { ...metadata };
};

export const createInventoryReservation = (params: InventoryReservation): InventoryReservation => ({
  reservationReference: params.reservationReference,
  ownerReference: params.ownerReference,
  inventoryItemReference: params.inventoryItemReference,
  quantity: params.quantity,
  status: params.status,
  reservedAt: new Date(params.reservedAt.getTime()),
  expiresAt: new Date(params.expiresAt.getTime()),
  consumedAt: cloneDate(params.consumedAt),
  releasedAt: cloneDate(params.releasedAt),
  expiredAt: cloneDate(params.expiredAt),
  externalOrderReference: params.externalOrderReference,
  version: params.version,
  metadata: cloneMetadata(params.metadata),
});

export const cloneInventoryReservation = (
  reservation: InventoryReservation,
): InventoryReservation => createInventoryReservation(reservation);
