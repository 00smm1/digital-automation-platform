export const WOOCOMMERCE_SOURCE_PREFIX = 'woocommerce';

export const createWooCommerceSourceId = (siteId: string): string => {
  const normalizedSiteId = siteId.trim();

  if (normalizedSiteId.length === 0) {
    throw new Error('WooCommerce site identifier must not be empty.');
  }

  return `${WOOCOMMERCE_SOURCE_PREFIX}:${normalizedSiteId}`;
};

export const isWooCommerceSourceId = (sourceId: string): boolean =>
  sourceId.startsWith(`${WOOCOMMERCE_SOURCE_PREFIX}:`);
