import type {
  InsufficientInventoryResult,
  InventoryItemNotFoundResult,
  RepositoryFailureResult,
  ReservationConflictResult,
  ReservationCreatedResult,
  ReservationDuplicateResult,
} from '../../inventory/reservation-results.js';

export type InventoryReservationRequest = {
  readonly inventoryItemReference: string;
  readonly ownerReference: string;
  readonly quantity: unknown;
  readonly externalOrderReference?: string;
  readonly reservationDurationMs?: number;
};

export type InventoryReservationStepOutput = {
  readonly reservationReference: string;
  readonly inventoryItemReference: string;
  readonly quantity: number;
  readonly status: 'reserved';
  readonly expiresAt: string;
};

export type InventoryReservationFailure =
  | ReservationConflictResult
  | InsufficientInventoryResult
  | InventoryItemNotFoundResult
  | RepositoryFailureResult
  | { readonly kind: 'invalid-quantity'; readonly reasonCode: string }
  | { readonly kind: 'invalid-reservation-request'; readonly reasonCode: string };

export type InventoryReservationPort = {
  reserve(
    request: InventoryReservationRequest,
  ): Promise<ReservationCreatedResult | ReservationDuplicateResult | InventoryReservationFailure>;
};

export type InventoryReservationLifecyclePort = {
  consumeReservation(
    reservationReference: string,
  ): Promise<import('../../inventory/reservation-results.js').ConsumeReservationOutcome>;
  releaseReservation(
    reservationReference: string,
  ): Promise<import('../../inventory/reservation-results.js').ReleaseReservationOutcome>;
};
