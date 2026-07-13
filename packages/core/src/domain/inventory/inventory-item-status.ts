export type InventoryItemStatus = 'available' | 'reserved' | 'delivered' | 'disabled';

export const INVENTORY_ITEM_STATUSES = [
  'available',
  'reserved',
  'delivered',
  'disabled',
] as const satisfies readonly InventoryItemStatus[];
