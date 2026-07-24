export type { InventoryServiceDependencies } from './inventory-service.dependencies.js';
export { InventoryService } from './inventory-service.js';
export { InventoryReservationService } from './inventory-reservation-service.js';
export type { InventoryReservationServiceDependencies } from './inventory-reservation-service.js';
export {
  ReservationPolicy,
  DeterministicReservationReferenceFactory,
  SequentialReservationReferenceFactory,
  createCompositionReservationReferenceFactory,
  DEFAULT_RESERVATION_POLICY_CONFIG,
} from './reservation-policy.js';
export type {
  ReservationPolicyConfig,
  ReservationReferenceFactory,
  ValidatedReservationRequest,
} from './reservation-policy.js';
export type {
  ReserveInventoryCommand,
  ConsumeReservationCommand,
  ReleaseReservationCommand,
  ExpireReservationCommand,
  ExpireDueReservationsCommand,
  ReserveInventoryOutcome,
  ConsumeReservationOutcome,
  ReleaseReservationOutcome,
  ExpireReservationOutcome,
  ExpireDueReservationsSummary,
  ExpireDueReservationsOutcome,
  InvalidReservationReferenceResult,
} from './reservation-results.js';
