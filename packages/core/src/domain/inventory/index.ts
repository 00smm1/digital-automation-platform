export type { InventoryItemPayload } from './inventory-item-payload.js';
export type { InventoryItemStatus } from './inventory-item-status.js';
export { INVENTORY_ITEM_STATUSES } from './inventory-item-status.js';
export type { InventoryItemType } from './inventory-item-type.js';
export { INVENTORY_ITEM_TYPES, isInventoryItemType } from './inventory-item-type.js';
export type { InventoryItemId, InventoryItemProps } from './inventory-item.js';
export { InventoryItem } from './inventory-item.js';
export type { InventoryRepository } from './inventory-repository.js';
export { InMemoryInventoryRepository } from './in-memory-inventory-repository.js';
export {
  InvalidInventoryTransitionError,
  InventoryItemNotAvailableError,
  InventoryItemNotFoundError,
  InventoryOutOfStockError,
} from './errors/inventory-errors.js';
export {
  createPositiveInventoryQuantity,
  createNonNegativeInventoryQuantity,
  type InventoryQuantity,
} from './inventory-quantity.js';
export {
  createInventoryItemReference,
  createReservationReference,
  parseReservationReference,
  createReservationOwnerReference,
  buildReservationDuplicateKey,
  type InventoryItemReference,
  type ReservationReference,
  type ReservationOwnerReference,
} from './inventory-references.js';
export {
  RESERVATION_STATUSES,
  TERMINAL_RESERVATION_STATUSES,
  isTerminalReservationStatus,
  type ReservationStatus,
} from './reservation-status.js';
export {
  createQuantityInventoryRecord,
  cloneQuantityInventoryRecord,
  applyReservationToInventory,
  applyConsumptionToInventory,
  applyReleaseToInventory,
  computeAvailableQuantity,
  type QuantityInventoryRecord,
  type SafeInventoryMetadata,
} from './quantity-inventory-record.js';
export {
  createInventoryReservation,
  cloneInventoryReservation,
  type InventoryReservation,
} from './inventory-reservation.js';
export {
  consumeReservationTransition,
  releaseReservationTransition,
  expireReservationTransition,
} from './reservation-transitions.js';
export type {
  InventoryReservationRepository,
  ReservationRequestRecord,
  TryReserveResult,
  TransitionReservationResult,
} from './inventory-reservation-repository.js';
export {
  InMemoryInventoryReservationRepository,
  createFailingInventoryReservationRepository,
} from './in-memory-inventory-reservation-repository.js';
export {
  InvalidInventoryQuantityError,
  ReservationTransitionError,
  InsufficientInventoryError,
  DuplicateReservationError,
  ReservationConflictError,
  QuantityInventoryItemNotFoundError,
  ReservationNotFoundError,
  RepositoryOperationError,
} from './errors/reservation-errors.js';
export * from './events/index.js';
