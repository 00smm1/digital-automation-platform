import { createAdfPaySourceId } from '../constants/adfpay-source-id.js';

export const TEST_ADFPAY_MERCHANT_ID = 'lord-tv';
export const TEST_ADFPAY_GATEWAY_SECRET = 'SENTINEL_GATEWAY_SECRET_DO_NOT_LEAK';
export const TEST_ADFPAY_SIGNATURE = 'SENTINEL_SIGNATURE_DO_NOT_LEAK';
export const TEST_ADFPAY_AUTH_TOKEN = 'SENTINEL_AUTH_TOKEN_DO_NOT_LEAK';
export const TEST_ADFPAY_PRODUCT_REFERENCE = '99001';

export type AdfPayPaymentFixtureOptions = {
  readonly paymentId?: string;
  readonly orderId?: string;
  readonly status?: string;
  readonly occurredAt?: string;
  readonly amountMinorUnits?: number;
  readonly currency?: string;
  readonly productReference?: string;
  readonly quantity?: number;
  readonly customerId?: string;
  readonly customerEmail?: string;
};

export const createAdfPayPaymentPayload = (
  options: AdfPayPaymentFixtureOptions = {},
): Record<string, unknown> => ({
  payment_id: options.paymentId ?? 'pay-1001',
  order_id: options.orderId ?? '1001',
  status: options.status ?? 'confirmed',
  occurred_at: options.occurredAt ?? '2026-07-21T08:00:00.000Z',
  amount_minor_units: options.amountMinorUnits ?? 4900,
  currency: options.currency ?? 'USD',
  product_reference: options.productReference ?? TEST_ADFPAY_PRODUCT_REFERENCE,
  quantity: options.quantity ?? 1,
  customer_id: options.customerId ?? '4242',
  customer_email: options.customerEmail ?? 'customer@example.com',
});

export const createAdfPayPaymentIngressInput = (
  options: AdfPayPaymentFixtureOptions & {
    readonly merchantId?: string;
    readonly eventType?: string;
    readonly externalEventId?: string;
    readonly receivedAt?: Date;
    readonly secret?: string;
    readonly signature?: string;
  } = {},
) => {
  const rawBody = JSON.stringify(createAdfPayPaymentPayload(options));

  return {
    sourceId: createAdfPaySourceId(options.merchantId ?? TEST_ADFPAY_MERCHANT_ID),
    externalEventId: options.externalEventId ?? `pay-event-${options.paymentId ?? '1001'}`,
    eventType: options.eventType ?? 'payment.updated',
    rawBody,
    signature: options.signature ?? TEST_ADFPAY_SIGNATURE,
    secret: options.secret ?? TEST_ADFPAY_GATEWAY_SECRET,
    receivedAt: options.receivedAt ?? new Date('2026-07-21T08:01:00.000Z'),
  };
};
