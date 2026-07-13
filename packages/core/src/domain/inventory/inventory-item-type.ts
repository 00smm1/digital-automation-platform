export type InventoryItemType = 'code' | 'account' | 'license' | 'token' | 'custom';

export const INVENTORY_ITEM_TYPES = [
  'code',
  'account',
  'license',
  'token',
  'custom',
] as const satisfies readonly InventoryItemType[];

export const isInventoryItemType = (value: string): value is InventoryItemType => {
  return (INVENTORY_ITEM_TYPES as readonly string[]).includes(value);
};
