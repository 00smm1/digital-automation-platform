import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  WooCommerceSignatureVerificationInput,
  WooCommerceSignatureVerifier,
} from './woocommerce-signature-verifier.js';

const computeWooCommerceSignature = (rawBody: string, secret: string): string =>
  createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

/**
 * Pure WooCommerce-compatible HMAC-SHA256 webhook signature verification.
 */
export class WooCommerceHmacSignatureVerifier implements WooCommerceSignatureVerifier {
  verify(input: WooCommerceSignatureVerificationInput) {
    const computedSignature = computeWooCommerceSignature(input.rawBody, input.secret);
    const providedBuffer = Buffer.from(input.signature, 'utf8');
    const computedBuffer = Buffer.from(computedSignature, 'utf8');

    if (providedBuffer.length !== computedBuffer.length) {
      return { valid: false };
    }

    return { valid: timingSafeEqual(providedBuffer, computedBuffer) };
  }
}

export const createWooCommerceWebhookSignature = (rawBody: string, secret: string): string =>
  computeWooCommerceSignature(rawBody, secret);
