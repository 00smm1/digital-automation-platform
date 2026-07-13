import { createEventName } from '../../events/event-name.js';
import type { DomainEvent } from '../../events/domain-event.js';
import type { InventoryItem, InventoryItemId } from '../inventory-item.js';

export const InventoryItemAddedEventName = createEventName('inventory.item.added');
export const InventoryItemReservedEventName = createEventName('inventory.item.reserved');
export const InventoryReservationReleasedEventName = createEventName(
  'inventory.reservation.released',
);
export const InventoryItemDeliveredEventName = createEventName('inventory.item.delivered');
export const InventoryItemDisabledEventName = createEventName('inventory.item.disabled');

export type InventoryItemAddedEvent = DomainEvent<typeof InventoryItemAddedEventName> & {
  readonly itemId: InventoryItemId;
  readonly productId: string;
  readonly item: InventoryItem;
};

export type InventoryItemReservedEvent = DomainEvent<typeof InventoryItemReservedEventName> & {
  readonly itemId: InventoryItemId;
  readonly productId: string;
  readonly orderItemId: string;
  readonly item: InventoryItem;
};

export type InventoryReservationReleasedEvent = DomainEvent<
  typeof InventoryReservationReleasedEventName
> & {
  readonly itemId: InventoryItemId;
  readonly productId: string;
  readonly item: InventoryItem;
};

export type InventoryItemDeliveredEvent = DomainEvent<typeof InventoryItemDeliveredEventName> & {
  readonly itemId: InventoryItemId;
  readonly productId: string;
  readonly orderItemId: string;
  readonly item: InventoryItem;
};

export type InventoryItemDisabledEvent = DomainEvent<typeof InventoryItemDisabledEventName> & {
  readonly itemId: InventoryItemId;
  readonly productId: string;
  readonly item: InventoryItem;
};

const createInventoryEventId = (itemId: InventoryItemId, suffix: string): string =>
  `${itemId}:${suffix}`;

export const createInventoryItemAddedEvent = (
  item: InventoryItem,
  occurredAt: Date = item.createdAt,
): InventoryItemAddedEvent => ({
  eventId: createInventoryEventId(item.id, 'added'),
  occurredAt,
  aggregateId: item.id,
  eventName: InventoryItemAddedEventName,
  itemId: item.id,
  productId: item.productId,
  item,
});

export const createInventoryItemReservedEvent = (
  item: InventoryItem,
  orderItemId: string,
  occurredAt: Date = item.updatedAt,
): InventoryItemReservedEvent => ({
  eventId: createInventoryEventId(item.id, 'reserved'),
  occurredAt,
  aggregateId: item.id,
  eventName: InventoryItemReservedEventName,
  itemId: item.id,
  productId: item.productId,
  orderItemId,
  item,
});

export const createInventoryReservationReleasedEvent = (
  item: InventoryItem,
  occurredAt: Date = item.updatedAt,
): InventoryReservationReleasedEvent => ({
  eventId: createInventoryEventId(item.id, 'reservation-released'),
  occurredAt,
  aggregateId: item.id,
  eventName: InventoryReservationReleasedEventName,
  itemId: item.id,
  productId: item.productId,
  item,
});

export const createInventoryItemDeliveredEvent = (
  item: InventoryItem,
  orderItemId: string,
  occurredAt: Date = item.updatedAt,
): InventoryItemDeliveredEvent => ({
  eventId: createInventoryEventId(item.id, 'delivered'),
  occurredAt,
  aggregateId: item.id,
  eventName: InventoryItemDeliveredEventName,
  itemId: item.id,
  productId: item.productId,
  orderItemId,
  item,
});

export const createInventoryItemDisabledEvent = (
  item: InventoryItem,
  occurredAt: Date = item.updatedAt,
): InventoryItemDisabledEvent => ({
  eventId: createInventoryEventId(item.id, 'disabled'),
  occurredAt,
  aggregateId: item.id,
  eventName: InventoryItemDisabledEventName,
  itemId: item.id,
  productId: item.productId,
  item,
});
