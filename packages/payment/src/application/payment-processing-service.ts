import type { InboundEventGateway } from '@dap/core';
import type { Clock } from '@dap/core';

import type { PaymentGatewayAdapter } from './ports/payment-gateway-adapter.js';
import type { PaymentGatewayIngressInput } from './ports/payment-gateway-ingress-input.js';
import type { PaymentRepository } from '../domain/payment-repository.js';
import { PaymentCorrelationService } from './payment-correlation-service.js';
import { PaymentAuthorizationPolicy } from './payment-authorization-policy.js';
import {
  createPaymentAuthorizedFulfillmentEnvelope,
  PaymentConfirmationInboundAdapter,
} from './payment-confirmation-inbound-adapter.js';
import { createPaymentAuthorizedFulfillmentEvent } from './payment-authorized-fulfillment-event.js';
import {
  createPaymentProcessingResult,
  type PaymentProcessingResult,
} from './payment-processing-result.js';
import {
  DuplicatePaymentFailure,
  PaymentConflictFailure,
  PaymentFailure,
  PaymentProcessingFailure,
} from '../domain/errors/payment-errors.js';
import type { PaymentConfirmation } from '../domain/payment-confirmation.js';
import {
  copyPaymentRecord,
  createPaymentRecordFromConfirmation,
} from '../domain/payment-record.js';
import { isAuthorizedPaymentStatus } from '../domain/payment-status.js';

const createSafeFailure = (error: unknown): PaymentFailure => {
  if (error instanceof PaymentFailure) {
    return error;
  }

  return new PaymentProcessingFailure('Payment processing failed unexpectedly.');
};

export class PaymentProcessingService {
  private readonly paymentGatewayAdapter: PaymentGatewayAdapter;
  private readonly repository: PaymentRepository;
  private readonly correlationService: PaymentCorrelationService;
  private readonly authorizationPolicy: PaymentAuthorizationPolicy;
  private readonly inboundGateway: InboundEventGateway;
  private readonly inboundAdapter: PaymentConfirmationInboundAdapter;
  private readonly clock: Clock;

  constructor(dependencies: {
    readonly paymentGatewayAdapter: PaymentGatewayAdapter;
    readonly repository: PaymentRepository;
    readonly correlationService: PaymentCorrelationService;
    readonly authorizationPolicy: PaymentAuthorizationPolicy;
    readonly inboundGateway: InboundEventGateway;
    readonly inboundAdapter: PaymentConfirmationInboundAdapter;
    readonly clock: Clock;
  }) {
    this.paymentGatewayAdapter = dependencies.paymentGatewayAdapter;
    this.repository = dependencies.repository;
    this.correlationService = dependencies.correlationService;
    this.authorizationPolicy = dependencies.authorizationPolicy;
    this.inboundGateway = dependencies.inboundGateway;
    this.inboundAdapter = dependencies.inboundAdapter;
    this.clock = dependencies.clock;
  }

  async process(input: PaymentGatewayIngressInput): Promise<PaymentProcessingResult> {
    try {
      const normalization = await this.paymentGatewayAdapter.normalize(input);

      if (!normalization.ok) {
        return this.createRejectedResult(normalization.error, input);
      }

      const confirmation = normalization.value;
      const correlation = await this.correlationService.correlate(confirmation);

      if (!correlation.ok) {
        return this.createRejectedResult(correlation.error, input, confirmation);
      }

      const commerceOrder = correlation.value.commerceOrder;
      const existingByPaymentReference = await this.repository.findByPaymentReference(
        confirmation.paymentReference,
      );
      const existingConfirmedByOrder = await this.repository.findConfirmedByExternalOrderReference(
        confirmation.externalOrderReference,
      );

      const authorization = await this.authorizationPolicy.evaluate({
        confirmation,
        commerceOrder,
        existingByPaymentReference,
        existingConfirmedByOrder,
      });

      if (authorization.decision === 'duplicate') {
        return createPaymentProcessingResult({
          outcome: 'duplicate',
          externalEventId: input.externalEventId,
          externalPaymentReference: String(confirmation.paymentReference),
          externalOrderReference: confirmation.externalOrderReference,
          paymentSource: String(confirmation.paymentSource),
          normalizedPaymentStatus: confirmation.status,
          authorizationDecision: authorization.decision,
          authorized: false,
          fulfillmentExecuted: false,
          reasonCode: authorization.reasonCode,
          reasonMessage: authorization.reasonMessage,
        });
      }

      if (authorization.decision === 'conflict') {
        return createPaymentProcessingResult({
          outcome: 'rejected',
          externalEventId: input.externalEventId,
          externalPaymentReference: String(confirmation.paymentReference),
          externalOrderReference: confirmation.externalOrderReference,
          paymentSource: String(confirmation.paymentSource),
          normalizedPaymentStatus: confirmation.status,
          authorizationDecision: authorization.decision,
          authorized: false,
          fulfillmentExecuted: false,
          reasonCode: authorization.reasonCode,
          reasonMessage: authorization.reasonMessage,
        });
      }

      const createResult = await this.repository.create(
        createPaymentRecordFromConfirmation(confirmation, {
          confirmedAt: isAuthorizedPaymentStatus(confirmation.status)
            ? this.clock.now()
            : undefined,
        }),
      );

      if (!createResult.ok) {
        if (createResult.error instanceof DuplicatePaymentFailure) {
          return createPaymentProcessingResult({
            outcome: 'duplicate',
            externalEventId: input.externalEventId,
            externalPaymentReference: String(confirmation.paymentReference),
            externalOrderReference: confirmation.externalOrderReference,
            paymentSource: String(confirmation.paymentSource),
            normalizedPaymentStatus: confirmation.status,
            authorizationDecision: 'duplicate',
            authorized: false,
            fulfillmentExecuted: false,
            reasonCode: createResult.error.failureCode,
            reasonMessage: createResult.error.message,
          });
        }

        if (createResult.error instanceof PaymentConflictFailure) {
          return createPaymentProcessingResult({
            outcome: 'rejected',
            externalEventId: input.externalEventId,
            externalPaymentReference: String(confirmation.paymentReference),
            externalOrderReference: confirmation.externalOrderReference,
            paymentSource: String(confirmation.paymentSource),
            normalizedPaymentStatus: confirmation.status,
            authorizationDecision: 'conflict',
            authorized: false,
            fulfillmentExecuted: false,
            reasonCode: createResult.error.failureCode,
            reasonMessage: createResult.error.message,
          });
        }

        return this.createRejectedResult(createResult.error, input, confirmation);
      }

      if (!authorization.authorized) {
        return createPaymentProcessingResult({
          outcome: 'authorized_not_fulfilled',
          externalEventId: input.externalEventId,
          externalPaymentReference: String(confirmation.paymentReference),
          externalOrderReference: confirmation.externalOrderReference,
          paymentSource: String(confirmation.paymentSource),
          normalizedPaymentStatus: confirmation.status,
          authorizationDecision: authorization.decision,
          authorized: false,
          fulfillmentExecuted: false,
          reasonCode: authorization.reasonCode,
          reasonMessage: authorization.reasonMessage,
        });
      }

      const envelope = createPaymentAuthorizedFulfillmentEnvelope({
        event: createPaymentAuthorizedFulfillmentEvent({
          paymentReference: confirmation.paymentReference,
          externalOrderReference: confirmation.externalOrderReference,
          paymentSource: confirmation.paymentSource,
          paymentStatus: confirmation.status,
          occurredAt: confirmation.occurredAt,
          commerceOrder,
          metadata: {
            gatewayEventType:
              typeof confirmation.metadata.gatewayEventType === 'string'
                ? confirmation.metadata.gatewayEventType
                : 'payment.updated',
          },
        }),
        sourceId: input.sourceId,
        externalEventId: input.externalEventId,
        receivedAt: input.receivedAt,
      });

      const inboundResult = await this.inboundGateway.process(envelope, this.inboundAdapter);
      const fulfillmentExecuted =
        inboundResult.status === 'processed' || inboundResult.status === 'partialProcessing';

      if (fulfillmentExecuted) {
        const updateResult = await this.repository.update(
          copyPaymentRecord({
            ...createResult.value,
            processedAt: this.clock.now(),
          }),
        );

        if (!updateResult.ok) {
          return createPaymentProcessingResult({
            outcome: 'partial_processing',
            externalEventId: input.externalEventId,
            externalPaymentReference: String(confirmation.paymentReference),
            externalOrderReference: confirmation.externalOrderReference,
            paymentSource: String(confirmation.paymentSource),
            normalizedPaymentStatus: confirmation.status,
            authorizationDecision: authorization.decision,
            authorized: true,
            fulfillmentExecuted: true,
            executionRunId: inboundResult.executionRunId,
            reasonCode: 'REPOSITORY_UPDATE_FAILED',
            reasonMessage:
              'Payment fulfillment completed but processing state could not be recorded.',
            inboundResult,
          });
        }
      }

      if (inboundResult.status === 'partialProcessing') {
        return createPaymentProcessingResult({
          outcome: 'partial_processing',
          externalEventId: input.externalEventId,
          externalPaymentReference: String(confirmation.paymentReference),
          externalOrderReference: confirmation.externalOrderReference,
          paymentSource: String(confirmation.paymentSource),
          normalizedPaymentStatus: confirmation.status,
          authorizationDecision: authorization.decision,
          authorized: true,
          fulfillmentExecuted: true,
          executionRunId: inboundResult.executionRunId,
          reasonCode: inboundResult.failureCode ?? 'ORDER_FULFILLMENT_MARK_FAILED',
          reasonMessage:
            inboundResult.failureReason ??
            'Payment fulfillment completed but order authorization state could not be finalized.',
          inboundResult,
        });
      }

      return createPaymentProcessingResult({
        outcome:
          inboundResult.status === 'duplicate'
            ? 'duplicate'
            : inboundResult.status === 'processed'
              ? 'processed'
              : inboundResult.status === 'failed'
                ? 'failed'
                : 'rejected',
        externalEventId: input.externalEventId,
        externalPaymentReference: String(confirmation.paymentReference),
        externalOrderReference: confirmation.externalOrderReference,
        paymentSource: String(confirmation.paymentSource),
        normalizedPaymentStatus: confirmation.status,
        authorizationDecision: authorization.decision,
        authorized: true,
        fulfillmentExecuted,
        executionRunId: inboundResult.executionRunId,
        reasonCode:
          inboundResult.failureCode ??
          (fulfillmentExecuted ? 'PROCESSED' : authorization.reasonCode),
        reasonMessage:
          inboundResult.failureReason ??
          (fulfillmentExecuted
            ? `Payment "${String(confirmation.paymentReference)}" fulfilled order "${confirmation.externalOrderReference}".`
            : authorization.reasonMessage),
        inboundResult,
      });
    } catch (error: unknown) {
      const failure = createSafeFailure(error);

      return createPaymentProcessingResult({
        outcome: 'failed',
        externalEventId: input.externalEventId,
        externalPaymentReference: '',
        externalOrderReference: '',
        paymentSource: input.sourceId,
        normalizedPaymentStatus: 'failed',
        authorizationDecision: 'rejected',
        authorized: false,
        fulfillmentExecuted: false,
        reasonCode: failure.failureCode,
        reasonMessage: failure.message,
      });
    }
  }

  private createRejectedResult(
    error: PaymentFailure,
    input: PaymentGatewayIngressInput,
    confirmation?: PaymentConfirmation,
  ): PaymentProcessingResult {
    return createPaymentProcessingResult({
      outcome: 'rejected',
      externalEventId: input.externalEventId,
      externalPaymentReference:
        confirmation === undefined ? '' : String(confirmation.paymentReference),
      externalOrderReference: confirmation === undefined ? '' : confirmation.externalOrderReference,
      paymentSource: input.sourceId,
      normalizedPaymentStatus: confirmation?.status ?? 'failed',
      authorizationDecision: 'rejected',
      authorized: false,
      fulfillmentExecuted: false,
      reasonCode: error.failureCode,
      reasonMessage: error.message,
    });
  }
}
