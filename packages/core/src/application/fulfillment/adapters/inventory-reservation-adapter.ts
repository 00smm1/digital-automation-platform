import { Result } from '../../../shared/types/result.js';
import type { InventoryService } from '../../inventory/inventory-service.js';
import type {
  InventoryReservationPort,
  InventoryReservationRequest,
  InventoryReservationResult,
} from '../ports/inventory-reservation-port.js';
import { InventoryOutOfStockError } from '../../../domain/inventory/errors/inventory-errors.js';

/**
 * Inventory reservation adapter backed by InventoryService.
 */
export class InventoryReservationAdapter implements InventoryReservationPort {
  private readonly inventoryService: InventoryService;

  constructor(inventoryService: InventoryService) {
    this.inventoryService = inventoryService;
  }

  async reserve(
    request: InventoryReservationRequest,
  ): Promise<Result<InventoryReservationResult, InventoryOutOfStockError>> {
    const inventoryItemIds: string[] = [];

    try {
      for (let index = 0; index < request.quantity; index += 1) {
        const orderItemReference = `${request.orderItemReference}:${index}`;
        const item = await this.inventoryService.reserveNextAvailableItem(
          request.productReference,
          orderItemReference,
        );
        inventoryItemIds.push(item.id);
      }

      return Result.ok({
        inventoryItemIds,
        productReference: request.productReference,
        reservedQuantity: request.quantity,
      });
    } catch (error: unknown) {
      if (error instanceof InventoryOutOfStockError) {
        return Result.fail(error);
      }

      throw error;
    }
  }
}
