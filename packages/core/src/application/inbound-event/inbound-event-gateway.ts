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
import { ExecutionRunLifecycleError } from '../../domain/execution-run/errors/execution-run-errors.js';
import type { ExecutionRunId } from '../../domain/execution-run/execution-run-id.js';
import type { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import type { InboundEventAdapter } from './inbound-event-adapter.js';
import type { InboundEventGatewayDependencies } from './inbound-event-gateway.dependencies.js';
import type { ExecutionRunCoordinator } from '../execution-run/execution-run-coordinator.js';
import { extractExternalOrderReference } from '../execution-run/execution-run-safety.js';
import { Result } from '../../shared/types/result.js';
import type { OrderFulfillmentAuthorizationPort } from '../../domain/fulfillment/order-fulfillment-authorization-port.js';
import type { OrderFulfillmentAuthorizationError } from '../../domain/fulfillment/errors/order-fulfillment-authorization-errors.js';

const isOperationalError = (error: unknown): error is Error => error instanceof Error;

const createSafeNormalizationFailureMessage = (params: {
  sourceId: string;
  externalEventId: string;
  eventType: string;
}): string =>
  `Failed to normalize inbound event "${params.externalEventId}" from source "${params.sourceId}" (type: ${params.eventType}).`;

const releaseAcquiredOrder = async (
  authorization: OrderFulfillmentAuthorizationPort | undefined,
  externalOrderReference: string | undefined,
): Promise<Result<void, OrderFulfillmentAuthorizationError> | undefined> => {
  if (authorization === undefined || externalOrderReference === undefined) {
    return undefined;
  }

  return authorization.release({ externalOrderReference });
};

const markOrderFulfilled = async (
  authorization: OrderFulfillmentAuthorizationPort | undefined,
  externalOrderReference: string | undefined,
): Promise<Result<void, OrderFulfillmentAuthorizationError> | undefined> => {
  if (authorization === undefined || externalOrderReference === undefined) {
    return undefined;
  }

  return authorization.markFulfilled({ externalOrderReference });
};

const createReleaseFailureResult = (params: {
  envelope: ExternalEventEnvelope;
  idempotencyKey: ReturnType<typeof createIdempotencyKey>;
  normalizedEventId: string;
  executionRunId?: ExecutionRunId;
  executionRunStatus?: InboundProcessingResult['executionRunStatus'];
  orchestrationResult?: InboundProcessingResult['orchestrationResult'];
  releaseError: OrderFulfillmentAuthorizationError;
}): InboundProcessingResult =>
  createInboundProcessingResult({
    status: 'failed',
    sourceId: params.envelope.sourceId,
    externalEventId: params.envelope.externalEventId,
    idempotencyKey: params.idempotencyKey,
    normalizedEventId: params.normalizedEventId,
    executionRunId: params.executionRunId,
    executionRunStatus: params.executionRunStatus ?? 'failed',
    idempotencyState: 'failed',
    orchestrationResult: params.orchestrationResult,
    failureReason: params.releaseError.message,
    failureCode: params.releaseError.failureCode,
  });

const handleReleaseFailure = async (params: {
  authorization: OrderFulfillmentAuthorizationPort | undefined;
  externalOrderReference: string | undefined;
  envelope: ExternalEventEnvelope;
  idempotencyKey: ReturnType<typeof createIdempotencyKey>;
  normalizedEventId: string;
  executionRunId?: ExecutionRunId;
  executionRunStatus?: InboundProcessingResult['executionRunStatus'];
  orchestrationResult?: InboundProcessingResult['orchestrationResult'];
}): Promise<InboundProcessingResult | undefined> => {
  const releaseResult = await releaseAcquiredOrder(
    params.authorization,
    params.externalOrderReference,
  );

  if (releaseResult !== undefined && !releaseResult.ok) {
    return createReleaseFailureResult({
      envelope: params.envelope,
      idempotencyKey: params.idempotencyKey,
      normalizedEventId: params.normalizedEventId,
      executionRunId: params.executionRunId,
      executionRunStatus: params.executionRunStatus,
      orchestrationResult: params.orchestrationResult,
      releaseError: releaseResult.error,
    });
  }

  return undefined;
};

/**
 * Provider-neutral inbound integration boundary.
 *
 * Normalizes external envelopes through adapters, claims idempotency, forwards accepted
 * events to the platform orchestrator, and records final processing state.
 */
export class InboundEventGateway {
  private readonly idempotencyStore: InboundEventGatewayDependencies['idempotencyStore'];
  private readonly orchestrator: PlatformEventOrchestrator;
  private readonly executionRunCoordinator?: ExecutionRunCoordinator;
  private readonly workflowDefinitionRepository?: InboundEventGatewayDependencies['workflowDefinitionRepository'];
  private readonly orderFulfillmentAuthorization?: OrderFulfillmentAuthorizationPort;

  constructor(dependencies: InboundEventGatewayDependencies) {
    this.idempotencyStore = dependencies.idempotencyStore;
    this.orchestrator = dependencies.orchestrator;
    this.executionRunCoordinator = dependencies.executionRunCoordinator;
    this.workflowDefinitionRepository = dependencies.workflowDefinitionRepository;
    this.orderFulfillmentAuthorization = dependencies.orderFulfillmentAuthorization;
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
    const externalOrderReference = extractExternalOrderReference(normalizedEvent.payload);

    if (this.orderFulfillmentAuthorization !== undefined) {
      if (externalOrderReference === undefined) {
        return createInboundProcessingResult({
          status: 'rejected',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          failureReason: `Inbound event "${envelope.externalEventId}" is missing an external order reference.`,
          failureCode: 'MISSING_ORDER_REFERENCE',
        });
      }

      if (await this.orderFulfillmentAuthorization.isFulfilled(externalOrderReference)) {
        return createInboundProcessingResult({
          status: 'rejected',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          failureReason: `Order "${externalOrderReference}" has already been fulfilled.`,
          failureCode: 'ORDER_ALREADY_FULFILLED',
        });
      }
    }

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
        const existingRun =
          this.executionRunCoordinator === undefined
            ? null
            : await this.executionRunCoordinator.findRunByIdempotencyKey(idempotencyKey);

        return createInboundProcessingResult({
          status: 'duplicate',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: existingRecord?.normalizedEventId ?? normalizedEvent.eventId,
          idempotencyState: existingRecord?.state,
          executionRunId: existingRun?.id,
          executionRunStatus: existingRun?.status,
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

    let acquiredOrderReference: string | undefined;

    if (this.orderFulfillmentAuthorization !== undefined && externalOrderReference !== undefined) {
      const acquireResult = await this.orderFulfillmentAuthorization.tryAcquire({
        externalOrderReference,
      });

      if (!acquireResult.ok) {
        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason: acquireResult.error.message,
        });

        return createInboundProcessingResult({
          status: 'rejected',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          idempotencyState: 'failed',
          failureReason: acquireResult.error.message,
          failureCode: acquireResult.error.failureCode,
        });
      }

      acquiredOrderReference = externalOrderReference;
    }

    let executionRunId: ExecutionRunId | undefined;

    if (this.executionRunCoordinator !== undefined) {
      const createRunResult = await this.executionRunCoordinator.createRun({
        envelope,
        normalizedEvent,
        idempotencyKey,
      });

      if (!createRunResult.ok) {
        const releaseFailure = await handleReleaseFailure({
          authorization: this.orderFulfillmentAuthorization,
          externalOrderReference: acquiredOrderReference,
          envelope,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
        });

        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason: createRunResult.error.message,
        });

        if (releaseFailure !== undefined) {
          return releaseFailure;
        }

        return createInboundProcessingResult({
          status: 'failed',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          idempotencyState: 'failed',
          failureReason: createRunResult.error.message,
          failureCode: createRunResult.error.failureCode,
        });
      }

      executionRunId = createRunResult.value.id;

      const startProcessingResult =
        await this.executionRunCoordinator.startProcessing(executionRunId);

      if (!startProcessingResult.ok) {
        const releaseFailure = await handleReleaseFailure({
          authorization: this.orderFulfillmentAuthorization,
          externalOrderReference: acquiredOrderReference,
          envelope,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus: 'failed',
        });

        await this.executionRunCoordinator.failRun({
          executionRunId,
          failureCode: startProcessingResult.error.failureCode,
          failureReason: startProcessingResult.error.message,
        });
        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason: startProcessingResult.error.message,
        });

        if (releaseFailure !== undefined) {
          return releaseFailure;
        }

        return createInboundProcessingResult({
          status: 'failed',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus: 'failed',
          idempotencyState: 'failed',
          failureReason: startProcessingResult.error.message,
          failureCode: startProcessingResult.error.failureCode,
        });
      }
    }

    const eventSnapshot = JSON.stringify(normalizedEvent);

    try {
      const orchestrationResult = await this.orchestrator.process(normalizedEvent, {
        executionRunId,
      });

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

      let executionRunStatus = undefined as InboundProcessingResult['executionRunStatus'];

      if (this.executionRunCoordinator !== undefined && executionRunId !== undefined) {
        const primaryOutcome = orchestrationResult.executionOutcomes[0];
        const workflowDefinition =
          primaryOutcome !== undefined && this.workflowDefinitionRepository !== undefined
            ? await this.workflowDefinitionRepository.findByReference(primaryOutcome.workflowId)
            : null;

        const finalizeResult = await this.executionRunCoordinator.finalizeFromOrchestration({
          executionRunId,
          orchestrationResult,
          workflowDefinition: workflowDefinition ?? undefined,
        });

        if (!finalizeResult.ok) {
          const releaseFailure = await handleReleaseFailure({
            authorization: this.orderFulfillmentAuthorization,
            externalOrderReference: acquiredOrderReference,
            envelope,
            idempotencyKey,
            normalizedEventId: normalizedEvent.eventId,
            executionRunId,
            executionRunStatus: 'failed',
            orchestrationResult,
          });

          await this.executionRunCoordinator.failRun({
            executionRunId,
            failureCode: finalizeResult.error.failureCode,
            failureReason: finalizeResult.error.message,
          });
          await this.idempotencyStore.markFailed({
            key: idempotencyKey,
            failureReason: finalizeResult.error.message,
          });

          if (releaseFailure !== undefined) {
            return releaseFailure;
          }

          return createInboundProcessingResult({
            status: 'failed',
            sourceId: envelope.sourceId,
            externalEventId: envelope.externalEventId,
            idempotencyKey,
            normalizedEventId: normalizedEvent.eventId,
            executionRunId,
            executionRunStatus: 'failed',
            idempotencyState: 'failed',
            orchestrationResult,
            failureReason: finalizeResult.error.message,
            failureCode: finalizeResult.error.failureCode,
          });
        }

        executionRunStatus = finalizeResult.value.status;
      }

      if (executionRunStatus === 'rejected') {
        const releaseFailure = await handleReleaseFailure({
          authorization: this.orderFulfillmentAuthorization,
          externalOrderReference: acquiredOrderReference,
          envelope,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus,
          orchestrationResult,
        });

        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason: `Platform orchestration rejected event "${normalizedEvent.eventId}".`,
        });

        if (releaseFailure !== undefined) {
          return releaseFailure;
        }

        return createInboundProcessingResult({
          status: 'rejected',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus,
          idempotencyState: 'failed',
          orchestrationResult,
          failureCode: 'VALIDATION_FAILED',
        });
      }

      if (orchestrationResult.overallStatus === 'failed') {
        const failureReason = `Platform orchestration failed for event "${normalizedEvent.eventId}".`;

        const releaseFailure = await handleReleaseFailure({
          authorization: this.orderFulfillmentAuthorization,
          externalOrderReference: acquiredOrderReference,
          envelope,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus: executionRunStatus ?? 'failed',
          orchestrationResult,
        });

        await this.idempotencyStore.markFailed({
          key: idempotencyKey,
          failureReason,
        });

        if (releaseFailure !== undefined) {
          return releaseFailure;
        }

        return createInboundProcessingResult({
          status: 'failed',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus: executionRunStatus ?? 'failed',
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

      const markResult = await markOrderFulfilled(
        this.orderFulfillmentAuthorization,
        acquiredOrderReference,
      );

      if (markResult !== undefined && !markResult.ok) {
        return createInboundProcessingResult({
          status: 'partialProcessing',
          sourceId: envelope.sourceId,
          externalEventId: envelope.externalEventId,
          idempotencyKey,
          normalizedEventId: normalizedEvent.eventId,
          executionRunId,
          executionRunStatus: executionRunStatus ?? 'completed',
          idempotencyState: 'completed',
          orchestrationResult,
          failureReason: markResult.error.message,
          failureCode: markResult.error.failureCode,
        });
      }

      return createInboundProcessingResult({
        status: 'processed',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        executionRunId,
        executionRunStatus: executionRunStatus ?? 'completed',
        idempotencyState: 'completed',
        orchestrationResult,
      });
    } catch (error: unknown) {
      const safeFailure = this.executionRunCoordinator?.createSafeFailureFromException(error) ?? {
        failureCode:
          error instanceof InboundEventGatewayError
            ? error.failureCode
            : error instanceof InboundEventNormalizationError
              ? error.failureCode
              : error instanceof ExecutionRunLifecycleError
                ? error.failureCode
                : 'PROCESSING_EXCEPTION',
        failureReason: isOperationalError(error)
          ? error instanceof InboundEventNormalizationError ||
            error instanceof InboundEventGatewayError ||
            error instanceof ExecutionRunLifecycleError
            ? error.message
            : `Inbound processing failed for event "${normalizedEvent.eventId}".`
          : 'Inbound processing failed unexpectedly.',
      };

      if (this.executionRunCoordinator !== undefined && executionRunId !== undefined) {
        await this.executionRunCoordinator.failRun({
          executionRunId,
          failureCode: safeFailure.failureCode,
          failureReason: safeFailure.failureReason,
        });
      }

      const releaseFailure = await handleReleaseFailure({
        authorization: this.orderFulfillmentAuthorization,
        externalOrderReference: acquiredOrderReference,
        envelope,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        executionRunId,
        executionRunStatus: 'failed',
      });

      await this.idempotencyStore.markFailed({
        key: idempotencyKey,
        failureReason: safeFailure.failureReason,
      });

      if (releaseFailure !== undefined) {
        return releaseFailure;
      }

      return createInboundProcessingResult({
        status: 'failed',
        sourceId: envelope.sourceId,
        externalEventId: envelope.externalEventId,
        idempotencyKey,
        normalizedEventId: normalizedEvent.eventId,
        executionRunId,
        executionRunStatus: 'failed',
        idempotencyState: 'failed',
        failureReason: safeFailure.failureReason,
        failureCode: safeFailure.failureCode,
      });
    }
  }
}
