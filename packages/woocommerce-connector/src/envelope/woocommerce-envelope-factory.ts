import { Result } from '@dap/core';
import { createExternalEventEnvelope, type ExternalEventEnvelope } from '@dap/core';

import { createWooCommerceSourceId } from '../constants/woocommerce-source-id.js';
import {
  isSupportedWooCommerceWebhookTopic,
  SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC,
} from '../constants/woocommerce-webhook-topic.js';
import {
  WooCommerceAdapterError,
  WooCommerceSignatureVerificationError,
} from '../errors/woocommerce-adapter-errors.js';
import { deriveWooCommerceExternalEventId } from './woocommerce-external-event-id.js';
import { safeParseWooCommerceOrderPayload } from '../parser/woocommerce-order-payload-parser.js';
import type { WooCommerceSignatureVerifier } from '../signature/woocommerce-signature-verifier.js';

export type WooCommerceWebhookIngressInput = {
  readonly siteId: string;
  readonly topic: string;
  readonly rawBody: string;
  readonly signature: string;
  readonly secret: string;
  readonly receivedAt: Date;
  readonly deliveryId?: string;
};

export type WooCommerceEnvelopeFactoryDependencies = {
  readonly signatureVerifier: WooCommerceSignatureVerifier;
};

const createSafeEnvelopeFailureMessage = (params: { siteId: string; topic: string }): string =>
  `Failed to create WooCommerce envelope for site "${params.siteId}" (topic: ${params.topic}).`;

export class WooCommerceEnvelopeFactory {
  private readonly signatureVerifier: WooCommerceSignatureVerifier;

  constructor(dependencies: WooCommerceEnvelopeFactoryDependencies) {
    this.signatureVerifier = dependencies.signatureVerifier;
  }

  create(
    input: WooCommerceWebhookIngressInput,
  ): Result<ExternalEventEnvelope, WooCommerceAdapterError> {
    if (!isSupportedWooCommerceWebhookTopic(input.topic)) {
      return Result.fail(
        new WooCommerceAdapterError(
          `Unsupported WooCommerce webhook topic "${input.topic}".`,
          'UNSUPPORTED_TOPIC',
        ),
      );
    }

    try {
      const verification = this.signatureVerifier.verify({
        rawBody: input.rawBody,
        signature: input.signature,
        secret: input.secret,
      });

      if (!verification.valid) {
        return Result.fail(new WooCommerceSignatureVerificationError());
      }
    } catch {
      return Result.fail(
        new WooCommerceAdapterError(
          createSafeEnvelopeFailureMessage({ siteId: input.siteId, topic: input.topic }),
          'SIGNATURE_VERIFIER_EXCEPTION',
        ),
      );
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(input.rawBody) as unknown;
    } catch {
      return Result.fail(
        new WooCommerceAdapterError(
          `Malformed WooCommerce webhook payload for site "${input.siteId}".`,
          'MALFORMED_PAYLOAD',
        ),
      );
    }

    const parsedOrder = safeParseWooCommerceOrderPayload(parsedPayload);

    if (parsedOrder instanceof WooCommerceAdapterError) {
      return Result.fail(parsedOrder);
    }

    const sourceId = createWooCommerceSourceId(input.siteId);
    const externalEventId = deriveWooCommerceExternalEventId({
      deliveryId: input.deliveryId,
      orderId: parsedOrder.orderId,
      dateModified: parsedOrder.dateModified,
      status: parsedOrder.status,
    });

    return Result.ok(
      createExternalEventEnvelope({
        sourceId,
        externalEventId,
        eventType: SUPPORTED_WOOCOMMERCE_WEBHOOK_TOPIC,
        receivedAt: input.receivedAt,
        payload: parsedPayload,
        headers: {},
        metadata: {
          topic: input.topic,
          orderId: parsedOrder.orderId,
          orderStatus: parsedOrder.status,
        },
      }),
    );
  }
}
