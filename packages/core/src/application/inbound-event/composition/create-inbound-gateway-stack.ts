import { InMemoryIdempotencyStore } from '../../../domain/inbound-event/in-memory-idempotency-store.js';
import { InMemoryExecutionRunRepository } from '../../../domain/execution-run/in-memory-execution-run-repository.js';
import { InboundEventGateway } from '../inbound-event-gateway.js';
import { FakeInboundEventAdapter } from '../fake-inbound-event-adapter.js';
import { ExecutionRunCoordinator } from '../../execution-run/execution-run-coordinator.js';
import { FakeClock } from '../../../shared/time/clock.js';
import { AutomationMatcher } from '../../automation-definition/automation-matcher.js';
import { PlatformEventOrchestrator } from '../../orchestration/platform-event-orchestrator.js';
import { PipelineWorkflowExecutionPort } from '../../orchestration/pipeline-workflow-execution-port.js';
import { PipelineRunner } from '../../workflow-pipeline/pipeline-runner.js';
import { createDigitalFulfillmentStepRegistry } from '../../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import {
  createDigitalFulfillmentStack,
  type DigitalFulfillmentStack,
} from '../../fulfillment/composition/create-digital-fulfillment-stack.js';

export type InboundGatewayStack = DigitalFulfillmentStack & {
  readonly clock: FakeClock;
  readonly executionRunRepository: InMemoryExecutionRunRepository;
  readonly executionRunCoordinator: ExecutionRunCoordinator;
  readonly idempotencyStore: InMemoryIdempotencyStore;
  readonly inboundGateway: InboundEventGateway;
  readonly inboundAdapter: FakeInboundEventAdapter;
};

export type CreateInboundGatewayStackOptions = Parameters<
  typeof createDigitalFulfillmentStack
>[0] & {
  readonly clock?: FakeClock;
};

export const createInboundGatewayStack = async (
  options: CreateInboundGatewayStackOptions = {},
): Promise<InboundGatewayStack> => {
  const clock = options.clock ?? new FakeClock();
  const fulfillmentStack = await createDigitalFulfillmentStack(options);
  const executionRunRepository = new InMemoryExecutionRunRepository();
  const executionRunCoordinator = new ExecutionRunCoordinator({
    repository: executionRunRepository,
    clock,
  });
  const idempotencyStore = new InMemoryIdempotencyStore();

  const pipelineRunner = new PipelineRunner({
    stepExecutorRegistry: createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: fulfillmentStack.inventoryReservationAdapter,
      provisioningPort: fulfillmentStack.provisioningAdapter,
      notificationPort: fulfillmentStack.notificationAdapter,
    }),
    progressObserver: executionRunCoordinator,
    clock,
  });

  const workflowExecutionPort = new PipelineWorkflowExecutionPort({
    pipelineRunner,
    workflowDefinitionRepository: fulfillmentStack.workflowDefinitionRepository,
  });
  const matcher = new AutomationMatcher({ repository: fulfillmentStack.automationRepository });
  const orchestrator = new PlatformEventOrchestrator({
    matcher,
    workflowExecutionPort,
    executionRunLifecyclePort: executionRunCoordinator,
  });
  const inboundAdapter = new FakeInboundEventAdapter();
  const inboundGateway = new InboundEventGateway({
    idempotencyStore,
    orchestrator,
    executionRunCoordinator,
    workflowDefinitionRepository: fulfillmentStack.workflowDefinitionRepository,
  });

  return {
    ...fulfillmentStack,
    orchestrator,
    clock,
    executionRunRepository,
    executionRunCoordinator,
    idempotencyStore,
    inboundGateway,
    inboundAdapter,
  };
};
