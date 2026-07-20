import type { Result } from '../../shared/types/result.js';
import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import type { ExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import type { InboundEventNormalizationError } from '../../domain/inbound-event/errors/inbound-event-errors.js';

export type InboundEventNormalizationResult = Result<
  NormalizedPlatformEvent,
  InboundEventNormalizationError
>;

/**
 * Transforms an external event envelope into a normalized platform event.
 * Vendor-specific mapping belongs in adapter implementations, not the gateway.
 */
export type InboundEventAdapter = {
  normalize(envelope: ExternalEventEnvelope): Promise<InboundEventNormalizationResult>;
};
