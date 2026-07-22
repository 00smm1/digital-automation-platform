export const ADFPAY_SOURCE_PREFIX = 'adfpay';

export const createAdfPaySourceId = (merchantId: string): string => {
  const normalizedMerchantId = merchantId.trim();

  if (normalizedMerchantId.length === 0) {
    throw new Error('AdfPay merchant identifier must not be empty.');
  }

  return `${ADFPAY_SOURCE_PREFIX}:${normalizedMerchantId}`;
};
