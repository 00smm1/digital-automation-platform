import type { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import type { IdempotencyStore } from '../../domain/inbound-event/idempotency-store.js';
import type { ExecutionRunCoordinator } from '../execution-run/execution-run-coordinator.js';
import type { WorkflowDefinitionRepository } from '../../domain/workflow-pipeline/workflow-definition-repository.js';
import type { OrderFulfillmentAuthorizationPort } from '../../domain/fulfillment/order-fulfillment-authorization-port.js';

export type InboundEventGatewayDependencies = {
  readonly idempotencyStore: IdempotencyStore;
  readonly orchestrator: PlatformEventOrchestrator;
  readonly executionRunCoordinator?: ExecutionRunCoordinator;
  readonly workflowDefinitionRepository?: WorkflowDefinitionRepository;
  readonly orderFulfillmentAuthorization?: OrderFulfillmentAuthorizationPort;
};
