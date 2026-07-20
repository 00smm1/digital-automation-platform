import {
  Result,
  createNormalizedPlatformEvent,
  InboundEventNormalizationError,
  type ExternalEventEnvelope,
  type InboundEventAdapter,
} from '@dap/core';

import {
  isAcceptedWooCommerceOrderStatus,
  isRejectedWooCommerceOrderStatus,
} from '../constants/woocommerce-order-status.js';
import {
  isSupportedWooCommerceWebhookTopic,
  PLATFORM_ORDER_PAID_EVENT_TYPE,
} from '../constants/woocommerce-webhook-topic.js';
import { WooCommerceAdapterError } from '../errors/woocommerce-adapter-errors.js';
import {
  parseWooCommerceOrderPayload,
  type ParsedWooCommerceLineItem,
  type ParsedWooCommerceOrder,
} from '../parser/woocommerce-order-payload-parser.js';

const createSafeNormalizationFailureMessage = (params: {
  sourceId: string;
  externalEventId: string;
}): string =>
  `Failed to normalize WooCommerce event "${params.externalEventId}" from source "${params.sourceId}".`;

const toNormalizationError = (error: WooCommerceAdapterError): InboundEventNormalizationError =>
  new InboundEventNormalizationError(error.message, error.failureCode);

const resolveProductReference = (lineItem: ParsedWooCommerceLineItem): string | undefined => {
  if (lineItem.variationId !== undefined && lineItem.variationId > 0) {
    return String(lineItem.variationId);
  }

  if (lineItem.productId > 0) {
    return String(lineItem.productId);
  }

  return undefined;
};

const resolveCustomerReference = (order: ParsedWooCommerceOrder): string | undefined => {
  if (order.customerId !== undefined && order.customerId > 0) {
    return String(order.customerId);
  }

  return order.billingEmail;
};

const buildSafeMetadata = (
  order: ParsedWooCommerceOrder,
  envelopeMetadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
  sourceTopic: envelopeMetadata.topic,
  currency: order.currency,
  total: order.total,
  lineItemMetadata: order.lineItems[0]?.metadata,
  orderMetadata: order.orderMetadata,
});

export class WooCommerceInboundEventAdapter implements InboundEventAdapter {
  async normalize(envelope: ExternalEventEnvelope) {
    if (!isSupportedWooCommerceWebhookTopic(envelope.eventType)) {
      return Result.fail(
        new InboundEventNormalizationError(
          `Unsupported WooCommerce webhook topic "${envelope.eventType}" from source "${envelope.sourceId}".`,
          'UNSUPPORTED_TOPIC',
        ),
      );
    }

    let parsedOrder: ParsedWooCommerceOrder;

    try {
      parsedOrder = parseWooCommerceOrderPayload(envelope.payload);
    } catch (error: unknown) {
      if (error instanceof WooCommerceAdapterError) {
        return Result.fail(toNormalizationError(error));
      }

      return Result.fail(
        new InboundEventNormalizationError(
          createSafeNormalizationFailureMessage({
            sourceId: envelope.sourceId,
            externalEventId: envelope.externalEventId,
          }),
          'PARSER_EXCEPTION',
        ),
      );
    }

    if (isRejectedWooCommerceOrderStatus(parsedOrder.status)) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" has unsupported status "${parsedOrder.status}".`,
          'UNSUPPORTED_ORDER_STATUS',
        ),
      );
    }

    if (!isAcceptedWooCommerceOrderStatus(parsedOrder.status)) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" has unsupported status "${parsedOrder.status}".`,
          'UNSUPPORTED_ORDER_STATUS',
        ),
      );
    }

    if (parsedOrder.lineItems.length !== 1) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" contains multiple fulfillable line items.`,
          'MULTIPLE_LINE_ITEMS',
        ),
      );
    }

    const lineItem = parsedOrder.lineItems[0];

    if (lineItem === undefined) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" is missing line items.`,
          'MISSING_LINE_ITEMS',
        ),
      );
    }

    const productReference = resolveProductReference(lineItem);

    if (productReference === undefined) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" has an invalid product reference.`,
          'INVALID_PRODUCT_REFERENCE',
        ),
      );
    }

    const customerReference = resolveCustomerReference(parsedOrder);

    if (customerReference === undefined) {
      return Result.fail(
        new InboundEventNormalizationError(
          `WooCommerce order "${parsedOrder.orderId}" is missing a customer reference.`,
          'MISSING_CUSTOMER_REFERENCE',
        ),
      );
    }

    const eventId = `${envelope.sourceId}:${envelope.externalEventId}`;

    return Result.ok(
      createNormalizedPlatformEvent({
        eventId,
        eventType: PLATFORM_ORDER_PAID_EVENT_TYPE,
        occurredAt: parsedOrder.occurredAt,
        payload: {
          order: {
            id: parsedOrder.orderId,
            status: 'paid',
          },
          customer: {
            id: customerReference,
            email: parsedOrder.billingEmail,
          },
          product: {
            reference: productReference,
            quantity: lineItem.quantity,
          },
          metadata: buildSafeMetadata(parsedOrder, envelope.metadata),
        },
      }),
    );
  }
}
