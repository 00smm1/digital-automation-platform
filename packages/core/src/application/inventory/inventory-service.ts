import type { EventBus } from '../events/event-bus.js';
import { InventoryItem, type InventoryItemId } from '../../domain/inventory/inventory-item.js';
import type { InventoryItemPayload } from '../../domain/inventory/inventory-item-payload.js';
import type { InventoryItemType } from '../../domain/inventory/inventory-item-type.js';
import type { InventoryRepository } from '../../domain/inventory/inventory-repository.js';
import {
  InventoryItemNotFoundError,
  InventoryOutOfStockError,
} from '../../domain/inventory/errors/inventory-errors.js';
import {
  createInventoryItemAddedEvent,
  createInventoryItemDeliveredEvent,
  createInventoryItemDisabledEvent,
  createInventoryItemReservedEvent,
  createInventoryReservationReleasedEvent,
} from '../../domain/inventory/events/inventory-events.js';
import type { InventoryServiceDependencies } from './inventory-service.dependencies.js';

/**
 * Application service for inventory lifecycle operations.
 */
export class InventoryService {
  private readonly repository: InventoryRepository;
  private readonly eventBus: EventBus;

  constructor(dependencies: InventoryServiceDependencies) {
    this.repository = dependencies.repository;
    this.eventBus = dependencies.eventBus;
  }

  async addItem(params: {
    id: InventoryItemId;
    productId: string;
    type: InventoryItemType;
    payload: InventoryItemPayload;
  }): Promise<InventoryItem> {
    const item = InventoryItem.create(params);
    await this.repository.save(item);
    await this.eventBus.publish(createInventoryItemAddedEvent(item));
    return item;
  }

  async reserveNextAvailableItem(productId: string, orderItemId: string): Promise<InventoryItem> {
    const reservedItem = await this.repository.reserveNextAvailable(productId, orderItemId);

    if (reservedItem === null) {
      throw new InventoryOutOfStockError(productId);
    }

    await this.eventBus.publish(createInventoryItemReservedEvent(reservedItem, orderItemId));

    return reservedItem;
  }

  async releaseReservation(itemId: InventoryItemId): Promise<InventoryItem> {
    const item = await this.requireItem(itemId);
    item.releaseReservation();
    await this.repository.save(item);
    await this.eventBus.publish(createInventoryReservationReleasedEvent(item));
    return item;
  }

  async markDelivered(itemId: InventoryItemId): Promise<InventoryItem> {
    const item = await this.requireItem(itemId);
    const orderItemId = item.reservedForOrderItemId ?? 'unknown-order-item';
    item.markDelivered();
    await this.repository.save(item);
    await this.eventBus.publish(createInventoryItemDeliveredEvent(item, orderItemId));
    return item;
  }

  async disableItem(itemId: InventoryItemId): Promise<InventoryItem> {
    const item = await this.requireItem(itemId);
    item.disable();
    await this.repository.save(item);
    await this.eventBus.publish(createInventoryItemDisabledEvent(item));
    return item;
  }

  private async requireItem(itemId: InventoryItemId): Promise<InventoryItem> {
    const item = await this.repository.findById(itemId);

    if (item === null) {
      throw new InventoryItemNotFoundError(itemId);
    }

    return item;
  }
}
