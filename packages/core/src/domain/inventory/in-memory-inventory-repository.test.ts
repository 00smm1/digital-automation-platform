import { describe, expect, it } from 'vitest';

import { InMemoryInventoryRepository } from './in-memory-inventory-repository.js';
import { InventoryItem } from './inventory-item.js';
import { createIdentifier } from '../../shared/types/identifier.js';

const createItem = (id: string, productId = 'product-1'): InventoryItem => {
  return InventoryItem.create({
    id: createIdentifier('InventoryItem', id),
    productId,
    type: 'code',
    payload: { code: id },
  });
};

describe('InMemoryInventoryRepository', () => {
  it('reserves only one item when two concurrent reservations target the same product', async () => {
    const repository = new InMemoryInventoryRepository();
    const item = createItem('item-1');

    await repository.save(item);

    const [firstReservation, secondReservation] = await Promise.all([
      repository.reserveNextAvailable('product-1', 'order-item-1'),
      repository.reserveNextAvailable('product-1', 'order-item-2'),
    ]);

    const reservedItems = [firstReservation, secondReservation].filter(
      (value): value is InventoryItem => value !== null,
    );

    expect(reservedItems).toHaveLength(1);
    expect(reservedItems[0]?.status).toBe('reserved');
    expect(await repository.countAvailableByProductId('product-1')).toBe(0);
  });

  it('allows concurrent reservations when multiple available items exist', async () => {
    const repository = new InMemoryInventoryRepository();

    await repository.save(createItem('item-1'));
    await repository.save(createItem('item-2'));

    const [firstReservation, secondReservation] = await Promise.all([
      repository.reserveNextAvailable('product-1', 'order-item-1'),
      repository.reserveNextAvailable('product-1', 'order-item-2'),
    ]);

    expect(firstReservation).not.toBeNull();
    expect(secondReservation).not.toBeNull();
    expect(firstReservation?.id).not.toBe(secondReservation?.id);
    expect(await repository.countAvailableByProductId('product-1')).toBe(0);
  });
});
