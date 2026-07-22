export const PAYMENT_STATUSES = [
  'pending',
  'confirmed',
  'failed',
  'cancelled',
  'refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const isPaymentStatus = (value: string): value is PaymentStatus =>
  (PAYMENT_STATUSES as readonly string[]).includes(value);

export const isAuthorizedPaymentStatus = (status: PaymentStatus): boolean => status === 'confirmed';
