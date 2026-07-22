export type PaymentSource = string & { readonly __brand: 'PaymentSource' };

export const createPaymentSource = (value: string): PaymentSource | undefined => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized as PaymentSource;
};
