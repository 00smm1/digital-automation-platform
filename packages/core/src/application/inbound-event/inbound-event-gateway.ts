import type { ExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import { createIdempotencyKey } from '../../domain/inbound-event/idempotency-key.js';
import {
  createInboundProcessingResult,
  type InboundProcessingResult,
} from '../../domain/inbound-event/inbound-processing-result.js';
import {
  IdempotencyClaimError,
  InboundEventGatewayError,
  InboundEventNormalizationError,
} from '../../domain/inbound-event/errors/inbound-event-errors.js';
import type { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import type { InboundEventAdapter } from './inbound-event-adapter.js';
import type { InboundEventGatewayDependencies } from './inbound-event-gateway.dependencies.js';

const isOperationalError = (error: unknown): error is Error => error instanceof Error;

const createSafeNormalizationFailureMessage = (params: {
  sourceId: string;
  externalEventId: string;
  eventType: string;
}): string =>
  `Failed to normalize inbound event "${params.externalEventId}" from source "${params.sourceId}" (type: ${params.eventType}).`;

/**
 * Provider-neutral inbound integration boundary.
 *
 * Normalizes external envelopes through adapters, claims idempotency, forwards accepted
 * events to the platform orchestrator, and records final processing state.
 */
export class InboundEventGateway {
  private readonly idempotencyStore: InboundEventGatewayDependencies['idempotencyStore'];
  private readonly orchestrator: PlatformEventOrchestrator;

  constructor(dependencies: InboundEventGatewayDependencies) {
    this.idempotencyStore = dependencies.idempotencyStore;
    this.orchestrator = dependencies.orchestrator;
  }

  async process(
    envelope: ExternalEventEnvelope,
    adapter: InboundEventAdapter,
  ): Promise<InboundProcessingResult> {
    const envelopeSnapshot = JSON.stringify(envelope);

    let normalizationResult;

    try {
      normalizationResult = await adapter.normalize(envelope);
    } catch (error: unknown) {
      const failureReason = isOperationalError(error)
        ? createSafeNormalizationFailureMessage({
            sourceId: envelope.sourceId,
            externalEventId: envelope.externalEventId,
            eventType: envelope.eventType,
          })
        : 'Inbound event normalization failed unexpectedly.';

      return createInboundProcessingResult({
        status: 'rejected',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        failureReason,
        failureCode: 'ADAPTER_EXCEPTION',
      });
    }

    if (!normalizationResult.ok) {
      return createInboundProcessingResult({
        status: 'rejected',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        failureReason: normalizationResult.error.message,
        failureCode: normalizationResult.error.failureCode,
      });
    }

    const normalizedEvent = normalizationResult.value;
    const idempotencyKey = createIdempotencyKey({
      sourceId: envelope.sourceId,
      externalEventId: envelope.externalEventId,
    });

    const claimResult = await this.idempotencyStore.claim({
      key: idempotencyKey,
      normalizedEventId: normalizedEvent.eventId,
    });

    if (!claimResult.ok) {
      if (claimResult.error instanceof IdempotencyClaimError) {
        const existingRecord = claimResult.error.existingRecord;

        return createInboundProcessingResult({
          status: 'duplicate',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: existingRecord?.normalizedEventId ?? normalizedEvent.eventId,
          idempotencyState: existingRecord?.state,
          failureReason: existingRecord?.failureReason,
          failureCode: claimResult.error.failureCode,
        });
      }

      return createInboundProcessingResult({
        status: 'claimFailed',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        failureReason: claimResult.error.message,
        failureCode: claimResult.error.failureCode,
      });
    }

    const eventSnapshot = JSON.stringify(normalizedEvent);

    try {
      const orchestrationResult = await this.orchestrator.process(normalizedEvent);

      if (JSON.stringify(normalizedEvent) !== eventSnapshot) {
        throw new InboundEventGatewayError(
          'Normalized platform event must remain immutable during inbound processing.',
          'EVENT_MUTATION',
        );
      }

      if (JSON.stringify(envelope) !== envelopeSnapshot) {
        throw new InboundEventGatewayError(
          'External event envelope must remain immutable during inbound processing.',
          'ENVELOPE_MUTATION',
        );
      }

      if (orchestrationResult.overallStatus === 'failed') {
        const failureReason = `Platform orchestration failed for event "${normalizedEvent.eventId}".`;

        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason,
        });

        return createInboundProcessingResult({
          status: 'failed',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          idempotencyState: 'failed',
          orchestrationResult,
          failureReason,
          failureCode: 'ORCHESTRATION_FAILED',
        });
      }

      await this.idempotencyStore.markCompleted({
        key: idempotencyKey,
        orchestrationResult,
      });

      return createInboundProcessingResult({
        status: 'processed',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        idempotencyState: 'completed',
        orchestrationResult,
      });
    } catch (error: unknown) {
      const failureReason = isOperationalError(error)
        ? error instanceof InboundEventNormalizationError ||
          error instanceof InboundEventGatewayError
          ? error.message
          : `Inbound processing failed for event "${normalizedEvent.eventId}".`
        : 'Inbound processing failed unexpectedly.';

      const failureCode =
        error instanceof InboundEventGatewayError
          ? error.failureCode
          : error instanceof InboundEventNormalizationError
            ? error.failureCode
            : 'PROCESSING_EXCEPTION';

      await this.idempotencyStore.markFailed({
        key: idempotencyKey,
        failureReason,
      });

      return createInboundProcessingResult({
        status: 'failed',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        idempotencyState: 'failed',
        failureReason,
        failureCode,
      });
    }
  }
}
