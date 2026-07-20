import { SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC } from '../constants/woocommerce-webhook-topic.js';

export const deriveWooCommerceExternalEventId = (params: {
  readonly deliveryId?: string;
  readonly orderId: string;
  readonly dateModified: string;
  readonly status: string;
}): string => {
  const deliveryId = params.deliveryId?.trim();

  if (deliveryId !== undefined && deliveryId.length > 0) {
    return deliveryId;
  }

  return `${SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC}:${params.orderId}:${params.dateModified}:${params.status}`;
};
