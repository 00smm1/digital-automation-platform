export type PaymentReference = string & { readonly __brand: 'PaymentReference' };

export const createPaymentReference = (value: string): PaymentReference | undefined => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized as PaymentReference;
};

export const toPaymentReferenceString = (reference: PaymentReference): string => String(reference);
