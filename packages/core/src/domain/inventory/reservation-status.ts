export const RESERVATION_STATUSES = ['reserved', 'consumed', 'released', 'expired'] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const TERMINAL_RESERVATION_STATUSES = ['consumed', 'released', 'expired'] as const;

export type TerminalReservationStatus = (typeof TERMINAL_RESERVATION_STATUSES)[number];

export const isTerminalReservationStatus = (
  status: ReservationStatus,
): status is TerminalReservationStatus =>
  status === 'consumed' || status === 'released' || status === 'expired';

export const assertExhaustiveReservationStatus = (status: never): never => {
  throw new Error(`Unhandled reservation status: ${String(status)}`);
};
