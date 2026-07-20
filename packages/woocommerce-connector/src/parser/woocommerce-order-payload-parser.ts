import {
  WooCommerceAdapterError,
  WooCommercePayloadParseError,
} from '../errors/woocommerce-adapter-errors.js';

export type ParsedWooCommerceLineItem = {
  readonly productId: number;
  readonly variationId?: number;
  readonly quantity: number;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type ParsedWooCommerceOrder = {
  readonly orderId: string;
  readonly status: string;
  readonly occurredAt: Date;
  readonly dateModified: string;
  readonly customerId?: number;
  readonly billingEmail?: string;
  readonly lineItems: readonly ParsedWooCommerceLineItem[];
  readonly orderMetadata: Readonly<Record<string, unknown>>;
  readonly currency?: string;
  readonly total?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const parseNonNegativeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
};

const parseMetadataArray = (value: unknown): Readonly<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return {};
  }

  const metadata: Record<string, unknown> = {};

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const key = entry.key;
    const entryValue = entry.value;

    if (typeof key === 'string' && key.trim().length > 0) {
      metadata[key] = entryValue;
    }
  }

  return metadata;
};

const parseLineItem = (value: unknown): ParsedWooCommerceLineItem | WooCommerceAdapterError => {
  if (!isRecord(value)) {
    return new WooCommerceAdapterError(
      'WooCommerce order line item is malformed.',
      'MALFORMED_PAYLOAD',
    );
  }

  const hasProductField = value.product_id !== undefined && value.product_id !== null;
  const productId = parsePositiveInteger(value.product_id);

  if (hasProductField && productId === undefined) {
    return new WooCommerceAdapterError(
      'WooCommerce order line item has an invalid product reference.',
      'INVALID_PRODUCT_REFERENCE',
    );
  }

  if (productId === undefined) {
    return new WooCommerceAdapterError(
      'WooCommerce order line item has an invalid product reference.',
      'INVALID_PRODUCT_REFERENCE',
    );
  }

  const hasQuantityField = value.quantity !== undefined && value.quantity !== null;
  const quantity = parsePositiveInteger(value.quantity);

  if (hasQuantityField && quantity === undefined) {
    return new WooCommerceAdapterError(
      'WooCommerce order line item has an invalid quantity.',
      'INVALID_QUANTITY',
    );
  }

  if (quantity === undefined) {
    return new WooCommerceAdapterError(
      'WooCommerce order line item has an invalid quantity.',
      'INVALID_QUANTITY',
    );
  }

  const variationId = parseNonNegativeInteger(value.variation_id);

  return {
    productId,
    variationId: variationId === 0 ? undefined : variationId,
    quantity,
    metadata: parseMetadataArray(value.meta_data),
  };
};

const parseTimestamp = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const parseBillingEmail = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const email = value.email;

  if (typeof email !== 'string') {
    return undefined;
  }

  const normalized = email.trim().toLowerCase();

  return normalized.length > 0 ? normalized : undefined;
};

export const parseWooCommerceOrderPayload = (payload: unknown): ParsedWooCommerceOrder => {
  if (!isRecord(payload)) {
    throw new WooCommercePayloadParseError();
  }

  const orderIdValue = payload.id;
  const orderId =
    typeof orderIdValue === 'number' && Number.isInteger(orderIdValue) && orderIdValue > 0
      ? String(orderIdValue)
      : typeof orderIdValue === 'string' && orderIdValue.trim().length > 0
        ? orderIdValue.trim()
        : undefined;

  if (orderId === undefined) {
    throw new WooCommerceAdapterError(
      'WooCommerce order payload is missing order ID.',
      'MISSING_ORDER_ID',
    );
  }

  const status = payload.status;

  if (typeof status !== 'string' || status.trim().length === 0) {
    throw new WooCommercePayloadParseError('WooCommerce order payload is missing order status.');
  }

  const dateModified =
    typeof payload.date_modified === 'string' && payload.date_modified.trim().length > 0
      ? payload.date_modified.trim()
      : typeof payload.date_modified_gmt === 'string' && payload.date_modified_gmt.trim().length > 0
        ? payload.date_modified_gmt.trim()
        : undefined;

  if (dateModified === undefined) {
    throw new WooCommercePayloadParseError(
      'WooCommerce order payload is missing modification timestamp.',
    );
  }

  const occurredAt =
    parseTimestamp(payload.date_modified) ??
    parseTimestamp(payload.date_modified_gmt) ??
    parseTimestamp(payload.date_created) ??
    parseTimestamp(payload.date_created_gmt);

  if (occurredAt === undefined) {
    throw new WooCommercePayloadParseError(
      'WooCommerce order payload is missing a valid timestamp.',
    );
  }

  if (!Array.isArray(payload.line_items)) {
    throw new WooCommerceAdapterError(
      'WooCommerce order payload is missing line items.',
      'MISSING_LINE_ITEMS',
    );
  }

  if (payload.line_items.length === 0) {
    throw new WooCommerceAdapterError(
      'WooCommerce order payload is missing line items.',
      'MISSING_LINE_ITEMS',
    );
  }

  const lineItems: ParsedWooCommerceLineItem[] = [];

  for (const lineItem of payload.line_items) {
    const parsedLineItem = parseLineItem(lineItem);

    if (parsedLineItem instanceof WooCommerceAdapterError) {
      throw parsedLineItem;
    }

    lineItems.push(parsedLineItem);
  }

  const customerId = parseNonNegativeInteger(payload.customer_id);
  const billingEmail = parseBillingEmail(payload.billing);
  const currency = typeof payload.currency === 'string' ? payload.currency : undefined;
  const total = typeof payload.total === 'string' ? payload.total : undefined;

  return {
    orderId,
    status: status.trim(),
    occurredAt,
    dateModified,
    customerId: customerId === 0 ? undefined : customerId,
    billingEmail,
    lineItems,
    orderMetadata: parseMetadataArray(payload.meta_data),
    currency,
    total,
  };
};

export const safeParseWooCommerceOrderPayload = (
  payload: unknown,
): ParsedWooCommerceOrder | WooCommerceAdapterError => {
  try {
    return parseWooCommerceOrderPayload(payload);
  } catch (error: unknown) {
    if (error instanceof WooCommerceAdapterError) {
      return error;
    }

    return new WooCommercePayloadParseError();
  }
};
