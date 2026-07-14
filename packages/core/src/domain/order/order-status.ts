export const ORDER_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const isOrderStatus = (value: string): value is OrderStatus => {
  return (ORDER_STATUSES as readonly string[]).includes(value);
};
