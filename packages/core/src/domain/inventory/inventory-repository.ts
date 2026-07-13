import type { InventoryItem, InventoryItemId } from './inventory-item.js';

/**
 * Persistence contract for inventory items.
 *
 * Concurrency contract:
 * Implementations MUST guarantee that two concurrent reservation attempts
 * cannot reserve the same inventory item. The `reserveNextAvailable` operation
 * is the atomic reservation boundary and must be implemented accordingly.
 */
export interface InventoryRepository {
  save(item: InventoryItem): Promise<void>;

  findById(id: InventoryItemId): Promise<InventoryItem | null>;

  findAvailableByProductId(productId: string): Promise<readonly InventoryItem[]>;

  countAvailableByProductId(productId: string): Promise<number>;

  /**
   * Atomically reserves the next available item for a product.
   *
   * Implementations MUST prevent two orders from reserving the same item,
   * even under concurrent calls.
   */
  reserveNextAvailable(productId: string, orderItemId: string): Promise<InventoryItem | null>;
}
