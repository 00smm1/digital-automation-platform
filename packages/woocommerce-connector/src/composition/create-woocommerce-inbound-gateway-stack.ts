import {
  AutomationMatcher,
  createDigitalFulfillmentStack,
  ExecutionRunCoordinator,
  FakeClock,
  InboundEventGateway,
  InMemoryExecutionRunRepository,
  InMemoryIdempotencyStore,
  PipelineRunner,
  PipelineWorkflowExecutionPort,
  PlatformEventOrchestrator,
  createDigitalFulfillmentStepRegistry,
  type CreateDigitalFulfillmentStackOptions,
  type DigitalFulfillmentStack,
} from '@dap/core';

import { WooCommerceInboundEventAdapter } from '../adapter/woocommerce-inbound-event-adapter.js';
import { WooCommerceEnvelopeFactory } from '../envelope/woocommerce-envelope-factory.js';
import { FakeWooCommerceSignatureVerifier } from '../signature/fake-woocommerce-signature-verifier.js';

export type WooCommerceInboundGatewayStack = DigitalFulfillmentStack & {
  readonly clock: FakeClock;
  readonly executionRunRepository: InMemoryExecutionRunRepository;
  readonly executionRunCoordinator: ExecutionRunCoordinator;
  readonly idempotencyStore: InMemoryIdempotencyStore;
  readonly inboundGateway: InboundEventGateway;
  readonly inboundAdapter: WooCommerceInboundEventAdapter;
  readonly envelopeFactory: WooCommerceEnvelopeFactory;
  readonly signatureVerifier: FakeWooCommerceSignatureVerifier;
};

export type CreateWooCommerceInboundGatewayStackOptions = CreateDigitalFulfillmentStackOptions & {
  readonly clock?: FakeClock;
};

export const createWooCommerceInboundGatewayStack = async (
  options: CreateWooCommerceInboundGatewayStackOptions = {},
): Promise<WooCommerceInboundGatewayStack> => {
  const clock = options.clock ?? new FakeClock();
  const fulfillmentStack = await createDigitalFulfillmentStack(options);
  const executionRunRepository = new InMemoryExecutionRunRepository();
  const executionRunCoordinator = new ExecutionRunCoordinator({
    repository: executionRunRepository,
    clock,
  });
  const idempotencyStore = new InMemoryIdempotencyStore();
  const signatureVerifier = new FakeWooCommerceSignatureVerifier();
  const envelopeFactory = new WooCommerceEnvelopeFactory({ signatureVerifier });
  const inboundAdapter = new WooCommerceInboundEventAdapter();

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
    envelopeFactory,
    signatureVerifier,
  };
};
