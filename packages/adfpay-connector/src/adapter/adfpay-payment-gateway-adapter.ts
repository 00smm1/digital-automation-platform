import { Result } from '@dap/core';
import {
  createPaymentConfirmation,
  createPaymentReference,
  createPaymentSource,
  PaymentParserFailure,
  PaymentVerificationFailure,
  type PaymentFailure,
  type PaymentGatewayAdapter,
  type PaymentGatewayIngressInput,
} from '@dap/payment';
import {
  ADFPAY_STATUS_TO_PAYMENT_STATUS,
  isSupportedAdfPayEventType,
} from '../constants/adfpay-event-type.js';
import { AdfPayAdapterError } from '../errors/adfpay-adapter-errors.js';
import { parseAdfPayPaymentPayload } from '../parser/adfpay-payment-payload-parser.js';
import type { AdfPaySignatureVerifier } from '../signature/adfpay-signature-verifier.js';

const mapAdapterError = (error: AdfPayAdapterError): PaymentFailure => {
  if (error.failureCode === 'VERIFICATION_FAILED') {
    return new PaymentVerificationFailure(error.message);
  }

  return new PaymentParserFailure(error.message);
};

export class AdfPayPaymentGatewayAdapter implements PaymentGatewayAdapter {
  private readonly signatureVerifier: AdfPaySignatureVerifier;

  constructor(dependencies: { readonly signatureVerifier: AdfPaySignatureVerifier }) {
    this.signatureVerifier = dependencies.signatureVerifier;
  }

  async normalize(input: PaymentGatewayIngressInput) {
    if (!isSupportedAdfPayEventType(input.eventType)) {
      return Result.fail(
        new PaymentParserFailure(`Unsupported AdfPay event type "${input.eventType}".`),
      );
    }

    try {
      const verification = this.signatureVerifier.verify({
        rawBody: input.rawBody,
        signature: input.signature,
        secret: input.secret,
      });

      if (!verification.valid) {
        return Result.fail(new PaymentVerificationFailure());
      }
    } catch {
      return Result.fail(
        new PaymentParserFailure('AdfPay payment authenticity verification failed unexpectedly.'),
      );
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(input.rawBody) as unknown;
    } catch {
      return Result.fail(new PaymentParserFailure('AdfPay payment payload is malformed.'));
    }

    try {
      const parsed = parseAdfPayPaymentPayload(parsedPayload);
      const paymentReference = createPaymentReference(parsed.paymentReference);

      if (paymentReference === undefined) {
        return Result.fail(
          new PaymentParserFailure('AdfPay payment payload is missing payment reference.'),
        );
      }

      const paymentSource = createPaymentSource(input.sourceId);

      if (paymentSource === undefined) {
        return Result.fail(new PaymentParserFailure('AdfPay payment source is invalid.'));
      }

      const confirmation = createPaymentConfirmation({
        paymentReference,
        externalOrderReference: parsed.externalOrderReference,
        paymentSource,
        status: ADFPAY_STATUS_TO_PAYMENT_STATUS[parsed.status],
        occurredAt: parsed.occurredAt,
        externalEventId: input.externalEventId,
        money: parsed.money,
        metadata: {
          gatewayEventType: input.eventType,
        },
      });

      return Result.ok(confirmation);
    } catch (error: unknown) {
      if (error instanceof AdfPayAdapterError) {
        return Result.fail(mapAdapterError(error));
      }

      return Result.fail(new PaymentParserFailure('AdfPay payment payload could not be parsed.'));
    }
  }
}
