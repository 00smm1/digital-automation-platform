export const SUPPORTED_ADFPAY_EVENT_TYPE = 'payment.updated' as const;

export type SupportedAdfPayEventType = typeof SUPPORTED_ADFPAY_EVENT_TYPE;

export const isSupportedAdfPayEventType = (
  eventType: string,
): eventType is SupportedAdfPayEventType => eventType === SUPPORTED_ADFPAY_EVENT_TYPE;

export const ADFPAY_STATUS_TO_PAYMENT_STATUS = {
  pending: 'pending',
  confirmed: 'confirmed',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
} as const;
