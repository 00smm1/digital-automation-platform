import type { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import type { IdempotencyStore } from '../../domain/inbound-event/idempotency-store.js';

export type InboundEventGatewayDependencies = {
  readonly idempotencyStore: IdempotencyStore;
  readonly orchestrator: PlatformEventOrchestrator;
};
