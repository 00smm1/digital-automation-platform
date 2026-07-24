import { Result } from '../../shared/types/result.js';
import {
  cloneInventoryReservation,
  createInventoryReservation,
  type InventoryReservation,
} from './inventory-reservation.js';
import { ReservationTransitionError } from './errors/reservation-errors.js';
import { isTerminalReservationStatus } from './reservation-status.js';

const isBeforeExpiry = (now: Date, expiresAt: Date): boolean => now.getTime() < expiresAt.getTime();

const isAtOrAfterExpiry = (now: Date, expiresAt: Date): boolean =>
  now.getTime() >= expiresAt.getTime();

export const consumeReservationTransition = (
  reservation: InventoryReservation,
  now: Date,
): Result<InventoryReservation, ReservationTransitionError> => {
  if (reservation.status === 'consumed') {
    return Result.ok(cloneInventoryReservation(reservation));
  }

  if (reservation.status === 'released') {
    return Result.fail(new ReservationTransitionError('reservation-already-released'));
  }

  if (reservation.status === 'expired') {
    return Result.fail(new ReservationTransitionError('reservation-already-expired'));
  }

  if (!isBeforeExpiry(now, reservation.expiresAt)) {
    return Result.fail(new ReservationTransitionError('reservation-expired'));
  }

  return Result.ok(
    createInventoryReservation({
      ...reservation,
      status: 'consumed',
      consumedAt: new Date(now.getTime()),
      version: reservation.version + 1,
    }),
  );
};

export const releaseReservationTransition = (
  reservation: InventoryReservation,
  now: Date,
): Result<InventoryReservation, ReservationTransitionError> => {
  if (reservation.status === 'released') {
    return Result.ok(cloneInventoryReservation(reservation));
  }

  if (reservation.status === 'consumed') {
    return Result.fail(new ReservationTransitionError('reservation-already-consumed'));
  }

  if (reservation.status === 'expired') {
    return Result.fail(new ReservationTransitionError('reservation-already-expired'));
  }

  return Result.ok(
    createInventoryReservation({
      ...reservation,
      status: 'released',
      releasedAt: new Date(now.getTime()),
      version: reservation.version + 1,
    }),
  );
};

export const expireReservationTransition = (
  reservation: InventoryReservation,
  now: Date,
): Result<InventoryReservation, ReservationTransitionError> => {
  if (reservation.status === 'expired') {
    return Result.ok(cloneInventoryReservation(reservation));
  }

  if (isTerminalReservationStatus(reservation.status)) {
    return Result.fail(new ReservationTransitionError(`reservation-already-${reservation.status}`));
  }

  if (!isAtOrAfterExpiry(now, reservation.expiresAt)) {
    return Result.fail(new ReservationTransitionError('invalid-expiration'));
  }

  return Result.ok(
    createInventoryReservation({
      ...reservation,
      status: 'expired',
      expiredAt: new Date(now.getTime()),
      version: reservation.version + 1,
    }),
  );
};
