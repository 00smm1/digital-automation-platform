import { describe, expect, it } from 'vitest';

import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { InventoryService } from './inventory-service.js';
import { InMemoryInventoryRepository } from '../../domain/inventory/in-memory-inventory-repository.js';
import {
  InventoryItemAddedEventName,
  InventoryItemDeliveredEventName,
  InventoryItemDisabledEventName,
  InventoryItemReservedEventName,
  InventoryReservationReleasedEventName,
} from '../../domain/inventory/events/inventory-events.js';
import {
  InvalidInventoryTransitionError,
  InventoryItemNotAvailableError,
  InventoryItemNotFoundError,
  InventoryOutOfStockError,
} from '../../domain/inventory/errors/inventory-errors.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import type { DomainEvent } from '../../domain/events/domain-event.js';
import type { InventoryItemId } from '../../domain/inventory/inventory-item.js';

const itemId = (value: string): InventoryItemId => createIdentifier('InventoryItem', value);

const createService = (): {
  service: InventoryService;
  repository: InMemoryInventoryRepository;
  published: DomainEvent[];
} => {
  const repository = new InMemoryInventoryRepository();
  const eventBus = new InMemoryEventBus();
  const published: DomainEvent[] = [];

  const eventNames = [
    InventoryItemAddedEventName,
    InventoryItemReservedEventName,
    InventoryReservationReleasedEventName,
    InventoryItemDeliveredEventName,
    InventoryItemDisabledEventName,
  ] as const;

  for (const eventName of eventNames) {
    eventBus.subscribe(eventName, {
      eventName,
      handle(event) {
        published.push(event);
      },
    });
  }

  return {
    service: new InventoryService({ repository, eventBus }),
    repository,
    published,
  };
};

describe('InventoryService', () => {
  it('adds an inventory item', async () => {
    const { service, published } = createService();

    const item = await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'license',
      payload: { key: 'LICENSE-001' },
    });

    expect(item.status).toBe('available');
    expect(published[0]?.eventName).toBe(InventoryItemAddedEventName);
  });

  it('reserves an available item', async () => {
    const { service } = createService();

    await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'code',
      payload: { code: 'CODE-001' },
    });

    const reserved = await service.reserveNextAvailableItem('product-1', 'order-item-1');

    expect(reserved.status).toBe('reserved');
    expect(reserved.reservedForOrderItemId).toBe('order-item-1');
    expect(reserved.reservedAt).toBeInstanceOf(Date);
  });

  it('throws when inventory is out of stock', async () => {
    const { service } = createService();

    await expect(
      service.reserveNextAvailableItem('missing-product', 'order-item-1'),
    ).rejects.toBeInstanceOf(InventoryOutOfStockError);
  });

  it('prevents duplicate reservation for the last available item', async () => {
    const { service } = createService();

    await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'token',
      payload: { token: 'TOKEN-001' },
    });

    await service.reserveNextAvailableItem('product-1', 'order-item-1');

    await expect(
      service.reserveNextAvailableItem('product-1', 'order-item-2'),
    ).rejects.toBeInstanceOf(InventoryOutOfStockError);
  });

  it('releases a reservation and returns the item to available', async () => {
    const { service } = createService();

    await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'account',
      payload: { username: 'user-1' },
    });

    const reserved = await service.reserveNextAvailableItem('product-1', 'order-item-1');
    const released = await service.releaseReservation(reserved.id);

    expect(released.status).toBe('available');
    expect(released.reservedForOrderItemId).toBeUndefined();
  });

  it('delivers a reserved item', async () => {
    const { service } = createService();

    await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'code',
      payload: { code: 'CODE-002' },
    });

    const reserved = await service.reserveNextAvailableItem('product-1', 'order-item-1');
    const delivered = await service.markDelivered(reserved.id);

    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toBeInstanceOf(Date);
  });

  it('rejects delivery of an available item', async () => {
    const { service } = createService();

    const item = await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'code',
      payload: { code: 'CODE-003' },
    });

    await expect(service.markDelivered(item.id)).rejects.toBeInstanceOf(
      InvalidInventoryTransitionError,
    );
  });

  it('disables an item', async () => {
    const { service } = createService();

    const item = await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'custom',
      payload: { asset: 'custom-asset' },
    });

    const disabled = await service.disableItem(item.id);

    expect(disabled.status).toBe('disabled');
  });

  it('prevents reservation of a disabled item', async () => {
    const { service } = createService();

    const item = await service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'code',
      payload: { code: 'CODE-004' },
    });

    await service.disableItem(item.id);

    await expect(
      service.reserveNextAvailableItem('product-1', 'order-item-1'),
    ).rejects.toBeInstanceOf(InventoryOutOfStockError);
  });

  it('throws when releasing an unknown item', async () => {
    const { service } = createService();

    await expect(service.releaseReservation(itemId('missing'))).rejects.toBeInstanceOf(
      InventoryItemNotFoundError,
    );
  });

  it('prevents reserving a disabled item at the entity level', async () => {
    const item = await createService().service.addItem({
      id: itemId('item-1'),
      productId: 'product-1',
      type: 'code',
      payload: { code: 'CODE-005' },
    });

    item.disable();

    expect(() => item.reserve('order-item-1')).toThrow(InventoryItemNotAvailableError);
  });
});
