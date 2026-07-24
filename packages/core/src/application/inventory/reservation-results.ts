import type { ReservationStatus } from '../../domain/inventory/reservation-status.js';

export type ReserveInventoryCommand = {
  readonly reservationReference?: string;
  readonly ownerReference: string;
  readonly inventoryItemReference: string;
  readonly quantity: unknown;
  readonly reservationDurationMs?: number;
  readonly expiresAt?: Date;
  readonly externalOrderReference?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type ConsumeReservationCommand = {
  readonly reservationReference: string;
};

export type ReleaseReservationCommand = {
  readonly reservationReference: string;
};

export type ExpireReservationCommand = {
  readonly reservationReference: string;
};

export type ExpireDueReservationsCommand = {
  readonly now?: Date;
};

export type ReservationOutcomeBase = {
  readonly reservationReference: string;
  readonly ownerReference: string;
  readonly inventoryItemReference: string;
  readonly quantity: number;
  readonly status: ReservationStatus;
};

export type ReservationCreatedResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-created';
  readonly reservedAt: Date;
  readonly expiresAt: Date;
};

export type ReservationDuplicateResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-duplicate';
  readonly reservedAt: Date;
  readonly expiresAt: Date;
};

export type ReservationConflictResult = {
  readonly kind: 'reservation-conflict';
  readonly reasonCode: string;
};

export type InsufficientInventoryResult = {
  readonly kind: 'insufficient-inventory';
};

export type InventoryItemNotFoundResult = {
  readonly kind: 'inventory-item-not-found';
};

export type ReservationConsumedResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-consumed';
  readonly consumedAt: Date;
};

export type ReservationReleasedResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-released';
  readonly releasedAt: Date;
};

export type ReservationExpiredResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-expired';
  readonly expiredAt: Date;
};

export type ReservationAlreadyTerminalResult = ReservationOutcomeBase & {
  readonly kind: 'reservation-already-terminal';
  readonly reasonCode: string;
};

export type ReservationNotFoundResult = {
  readonly kind: 'reservation-not-found';
};

export type RepositoryFailureResult = {
  readonly kind: 'repository-failed';
  readonly reasonCode: string;
};

export type ReservationTransitionFailureResult = {
  readonly kind: 'reservation-transition-failed';
  readonly reasonCode: string;
};

export type PartialProcessingResult = {
  readonly kind: 'partial-processing';
  readonly reasonCode: string;
  readonly reservationReference?: string;
  readonly inventoryItemReference?: string;
  readonly quantity?: number;
  readonly status?: ReservationStatus;
};

export type InvalidReservationReferenceResult = {
  readonly kind: 'invalid-reservation-reference';
  readonly reasonCode: string;
};

export type ExpireDueReservationsSummary = {
  readonly kind: 'expiration-summary';
  readonly inspectedCount: number;
  readonly expiredCount: number;
  readonly skippedTerminalCount: number;
  readonly failedCount: number;
  readonly failedReservationReferences: readonly string[];
};

export type InvalidExpirationTimeResult = {
  readonly kind: 'invalid-expiration-time';
  readonly reasonCode: string;
};

export type ExpireDueReservationsOutcome =
  ExpireDueReservationsSummary | InvalidExpirationTimeResult | RepositoryFailureResult;

export type ReserveInventoryOutcome =
  | ReservationCreatedResult
  | ReservationDuplicateResult
  | ReservationConflictResult
  | InsufficientInventoryResult
  | InventoryItemNotFoundResult
  | RepositoryFailureResult;

export type ConsumeReservationOutcome =
  | ReservationConsumedResult
  | ReservationAlreadyTerminalResult
  | ReservationNotFoundResult
  | ReservationTransitionFailureResult
  | RepositoryFailureResult
  | PartialProcessingResult
  | InvalidReservationReferenceResult;

export type ReleaseReservationOutcome =
  | ReservationReleasedResult
  | ReservationAlreadyTerminalResult
  | ReservationNotFoundResult
  | ReservationTransitionFailureResult
  | RepositoryFailureResult
  | PartialProcessingResult
  | InvalidReservationReferenceResult;

export type ExpireReservationOutcome =
  | ReservationExpiredResult
  | ReservationAlreadyTerminalResult
  | ReservationNotFoundResult
  | ReservationTransitionFailureResult
  | RepositoryFailureResult
  | InvalidReservationReferenceResult;

export const mapReservationToOutcomeBase = (reservation: {
  readonly reservationReference: string;
  readonly ownerReference: string;
  readonly inventoryItemReference: string;
  readonly quantity: number;
  readonly status: ReservationStatus;
}): ReservationOutcomeBase => ({
  reservationReference: reservation.reservationReference,
  ownerReference: reservation.ownerReference,
  inventoryItemReference: reservation.inventoryItemReference,
  quantity: reservation.quantity,
  status: reservation.status,
});
