import { DomainError } from '../../../shared/errors/domain-error.js';
import type { InventoryItemId } from '../inventory-item.js';
import type { InventoryItemStatus } from '../inventory-item-status.js';

export class InventoryItemNotFoundError extends DomainError {
  readonly code = 'INVENTORY_ITEM_NOT_FOUND';

  constructor(readonly itemId: InventoryItemId) {
    super(`Inventory item "${itemId}" was not found.`);
  }
}

export class InventoryOutOfStockError extends DomainError {
  readonly code = 'INVENTORY_OUT_OF_STOCK';

  constructor(readonly productId: string) {
    super(`No available inventory items remain for product "${productId}".`);
  }
}

export class InventoryItemNotAvailableError extends DomainError {
  readonly code = 'INVENTORY_ITEM_NOT_AVAILABLE';

  constructor(
    readonly itemId: InventoryItemId,
    readonly status: InventoryItemStatus,
  ) {
    super(`Inventory item "${itemId}" is not available. Current status: ${status}.`);
  }
}

export class InvalidInventoryTransitionError extends DomainError {
  readonly code = 'INVALID_INVENTORY_TRANSITION';

  constructor(
    readonly currentStatus: InventoryItemStatus,
    readonly targetStatus: InventoryItemStatus | 'available',
  ) {
    super(`Cannot transition inventory item from "${currentStatus}" to "${targetStatus}".`);
  }
}
