import { InventoryItem } from './inventory-item.js';
import type { InventoryItemId } from './inventory-item.js';
import type { InventoryRepository } from './inventory-repository.js';

const cloneItem = (item: InventoryItem): InventoryItem => {
  return InventoryItem.restore(item.id, item.toProps());
};

/**
 * In-memory repository with per-product reservation locks for atomic reservation.
 */
export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly items = new Map<InventoryItemId, InventoryItem>();
  private readonly reservationLocks = new Map<string, Promise<void>>();

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id, cloneItem(item));
  }

  async findById(id: InventoryItemId): Promise<InventoryItem | null> {
    const item = this.items.get(id);
    return item ? cloneItem(item) : null;
  }

  async findAvailableByProductId(productId: string): Promise<readonly InventoryItem[]> {
    return [...this.items.values()]
      .filter((item) => item.productId === productId && item.status === 'available')
      .map((item) => cloneItem(item));
  }

  async countAvailableByProductId(productId: string): Promise<number> {
    return [...this.items.values()].filter(
      (item) => item.productId === productId && item.status === 'available',
    ).length;
  }

  async reserveNextAvailable(
    productId: string,
    orderItemId: string,
  ): Promise<InventoryItem | null> {
    return this.withProductReservationLock(productId, async () => {
      const availableItems = await this.findAvailableByProductId(productId);
      const nextItem = availableItems[0];

      if (nextItem === undefined) {
        return null;
      }

      const persisted = await this.findById(nextItem.id);

      if (persisted === null || persisted.status !== 'available') {
        return null;
      }

      persisted.reserve(orderItemId);
      await this.save(persisted);
      return cloneItem(persisted);
    });
  }

  private async withProductReservationLock<T>(
    productId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previousLock = this.reservationLocks.get(productId) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.reservationLocks.set(
      productId,
      previousLock.then(() => currentLock),
    );

    await previousLock;

    try {
      return await operation();
    } finally {
      releaseLock();
    }
  }
}
