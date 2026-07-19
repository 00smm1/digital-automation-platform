import type { Result } from '../../../shared/types/result.js';
import type { InventoryOutOfStockError } from '../../../domain/inventory/errors/inventory-errors.js';

export type InventoryReservationRequest = {
  readonly productReference: string;
  readonly orderItemReference: string;
  readonly quantity: number;
};

export type InventoryReservationResult = {
  readonly inventoryItemIds: readonly string[];
  readonly productReference: string;
  readonly reservedQuantity: number;
};

export type InventoryReservationPort = {
  reserve(
    request: InventoryReservationRequest,
  ): Promise<Result<InventoryReservationResult, InventoryOutOfStockError>>;
};
