export const SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC = 'order.updated' as const;

export type SupportedWooCommerceWebhookTopic = typeof SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC;

export const PLATFORM_ORDER_PAID_EVENT_TYPE = 'order.paid' as const;

export const isSupportedWooCommerceWebhookTopic = (
  topic: string,
): topic is SupportedWooCommerceWebhookTopic => topic === SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC;
