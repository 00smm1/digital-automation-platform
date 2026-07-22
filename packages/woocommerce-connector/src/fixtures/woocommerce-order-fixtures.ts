import { createWooCommerceWebhookSignature } from '../signature/woocommerce-hmac-signature-verifier.js';

export const TEST_WOOCOMMERCE_SITE_ID = 'lord-tv-store';
export const TEST_WOOCOMMERCE_WEBHOOK_SECRET = 'SENTINEL_WEBHOOK_SECRET_DO_NOT_LEAK';
export const TEST_WOOCOMMERCE_PRODUCT_ID = 99001;
export const TEST_WOOCOMMERCE_VARIATION_ID = 88002;
export const TEST_WOOCOMMERCE_CUSTOMER_ID = 4242;
export const TEST_WOOCOMMERCE_BILLING_EMAIL = 'customer@example.com';

export type WooCommerceOrderFixtureOptions = {
  readonly orderId?: number;
  readonly status?: string;
  readonly dateModified?: string;
  readonly customerId?: number;
  readonly billingEmail?: string;
  readonly productId?: number;
  readonly variationId?: number;
  readonly quantity?: number;
  readonly currency?: string;
  readonly total?: string;
  readonly lineItems?: readonly Record<string, unknown>[];
};

export const createWooCommerceOrderPayload = (
  options: WooCommerceOrderFixtureOptions = {},
): Record<string, unknown> => {
  const orderId = options.orderId ?? 1001;
  const status = options.status ?? 'processing';
  const dateModified = options.dateModified ?? '2026-07-20T10:05:00';
  const productId = options.productId ?? TEST_WOOCOMMERCE_PRODUCT_ID;
  const variationId = options.variationId ?? 0;
  const quantity = options.quantity ?? 1;

  return {
    id: orderId,
    status,
    date_created: '2026-07-20T10:00:00',
    date_modified: dateModified,
    customer_id: options.customerId ?? TEST_WOOCOMMERCE_CUSTOMER_ID,
    billing: {
      email: options.billingEmail ?? TEST_WOOCOMMERCE_BILLING_EMAIL,
    },
    line_items: options.lineItems ?? [
      {
        product_id: productId,
        variation_id: variationId,
        quantity,
        meta_data: [{ key: 'fulfillment_channel', value: 'digital' }],
      },
    ],
    meta_data: [{ key: 'store_channel', value: 'woocommerce' }],
    currency: options.currency ?? 'USD',
    total: options.total ?? '49.00',
  };
};

export const createSignedWooCommerceWebhookInput = (
  options: WooCommerceOrderFixtureOptions & {
    readonly siteId?: string;
    readonly topic?: string;
    readonly deliveryId?: string;
    readonly receivedAt?: Date;
    readonly secret?: string;
  } = {},
) => {
  const payload = createWooCommerceOrderPayload(options);
  const rawBody = JSON.stringify(payload);
  const secret = options.secret ?? TEST_WOOCOMMERCE_WEBHOOK_SECRET;

  return {
    siteId: options.siteId ?? TEST_WOOCOMMERCE_SITE_ID,
    topic: options.topic ?? 'order.updated',
    rawBody,
    signature: createWooCommerceWebhookSignature(rawBody, secret),
    secret,
    receivedAt: options.receivedAt ?? new Date('2026-07-20T10:06:00.000Z'),
    deliveryId: options.deliveryId,
  };
};
