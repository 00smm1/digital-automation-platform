import { DomainError } from '../../../shared/errors/domain-error.js';

export type InvalidInventoryQuantityReasonCode =
  | 'invalid-type'
  | 'nan'
  | 'non-finite'
  | 'non-integer'
  | 'unsafe-integer'
  | 'non-positive'
  | 'negative';

export class InvalidInventoryQuantityError extends DomainError {
  readonly code = 'invalid-quantity' as const;

  constructor(public readonly reasonCode: InvalidInventoryQuantityReasonCode) {
    super('Inventory quantity is invalid.');
  }
}

export type ReservationTransitionReasonCode =
  | 'reservation-not-found'
  | 'invalid-reservation-transition'
  | 'reservation-already-consumed'
  | 'reservation-already-released'
  | 'reservation-already-expired'
  | 'reservation-expired'
  | 'invalid-expiration';

export class ReservationTransitionError extends DomainError {
  readonly code = 'invalid-reservation-transition' as const;

  constructor(public readonly reasonCode: ReservationTransitionReasonCode) {
    super('Reservation transition is invalid.');
  }
}

export class InventoryQuantityInvariantError extends DomainError {
  readonly code = 'unexpected-inventory-failure' as const;

  constructor(public readonly reasonCode: string) {
    super('Inventory quantity invariant was violated.');
  }
}

export class ReservationConflictError extends DomainError {
  readonly code = 'reservation-conflict' as const;

  constructor(public readonly reasonCode: string) {
    super('Reservation request conflicts with an existing reservation.');
  }
}

export class DuplicateReservationError extends DomainError {
  readonly code = 'duplicate-reservation' as const;

  constructor() {
    super('An identical active reservation already exists.');
  }
}

export class InsufficientInventoryError extends DomainError {
  readonly code = 'insufficient-inventory' as const;

  constructor() {
    super('Insufficient inventory is available for reservation.');
  }
}

export class QuantityInventoryItemNotFoundError extends DomainError {
  readonly code = 'inventory-item-not-found' as const;

  constructor(public readonly inventoryItemReference: string) {
    super('Inventory item was not found.');
  }
}

export class ReservationNotFoundError extends DomainError {
  readonly code = 'reservation-not-found' as const;

  constructor(public readonly reservationReference: string) {
    super('Reservation was not found.');
  }
}

export class RepositoryOperationError extends DomainError {
  readonly code = 'repository-failed' as const;

  constructor(public readonly reasonCode: string) {
    super('Repository operation failed.');
  }
}
