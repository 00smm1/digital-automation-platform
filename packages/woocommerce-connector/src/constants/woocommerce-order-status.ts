export const ACCEPTED_WOOCOMMERCE_ORDER_STATUSES = ['processing', 'completed'] as const;

export type AcceptedWooCommerceOrderStatus = (typeof ACCEPTED_WOOCOMMERCE_ORDER_STATUSES)[number];

export const REJECTED_WOOCOMMERCE_ORDER_STATUSES = [
  'pending',
  'on-hold',
  'failed',
  'cancelled',
  'refunded',
  'trash',
] as const;

export type RejectedWooCommerceOrderStatus = (typeof REJECTED_WOOCOMMERCE_ORDER_STATUSES)[number];

export const isAcceptedWooCommerceOrderStatus = (
  status: string,
): status is AcceptedWooCommerceOrderStatus =>
  (ACCEPTED_WOOCOMMERCE_ORDER_STATUSES as readonly string[]).includes(status);

export const isRejectedWooCommerceOrderStatus = (
  status: string,
): status is RejectedWooCommerceOrderStatus =>
  (REJECTED_WOOCOMMERCE_ORDER_STATUSES as readonly string[]).includes(status);
