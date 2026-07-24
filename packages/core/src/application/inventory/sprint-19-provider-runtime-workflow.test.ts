import { describe, expect, it } from 'vitest';

import {
  createTestInboundGatewayStack,
  type InboundGatewayStack,
} from '../../testing/create-test-inbound-gateway-stack.js';
import { createValidExternalOrderPaidEnvelope } from '../inbound-event/fake-inbound-event-adapter.js';
import { createDigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { FakeClock } from '../../shared/time/clock.js';
import {
  createFailingInventoryReservationRepository,
  InMemoryInventoryReservationRepository,
} from '../../domain/inventory/in-memory-inventory-reservation-repository.js';
import { InventoryReservationService } from './inventory-reservation-service.js';
import { DeterministicReservationReferenceFactory } from './reservation-policy.js';
import { QuantityInventoryReservationAdapter } from '../fulfillment/adapters/quantity-inventory-reservation-adapter.js';
import { createQuantityInventoryRecord } from '../../domain/inventory/quantity-inventory-record.js';
import { computeAvailableQuantity } from '../../domain/inventory/quantity-inventory-record.js';
import { createInventoryItemReference } from '../../domain/inventory/inventory-references.js';
import { InMemoryAutomationDefinitionRepository } from '../../domain/automation-definition/in-memory-automation-definition-repository.js';
import { InMemoryWorkflowDefinitionRepository } from '../../domain/workflow-pipeline/in-memory-workflow-definition-repository.js';
import { AutomationMatcher } from '../automation-definition/automation-matcher.js';
import { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import { PipelineWorkflowExecutionPort } from '../orchestration/pipeline-workflow-execution-port.js';
import { PipelineRunner } from '../workflow-pipeline/pipeline-runner.js';
import { createDigitalFulfillmentStepRegistry } from '../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import { createDigitalProductFulfillmentWorkflowDefinition } from '../workflow-pipeline/fixtures/digital-product-fulfillment-workflow.js';
import { DigitalFulfillmentService } from '../fulfillment/digital-fulfillment-service.js';
import { InMemoryCustomerNotificationAdapter } from '../fulfillment/adapters/in-memory-customer-notification-adapter.js';
import { AutomationDefinition } from '../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../domain/automation-definition/condition-group.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE } from '../fulfillment/fulfillment-pipeline-step-types.js';
import {
  createTestProviderRuntimeStack,
  DeterministicTimeoutExecutor,
  createDeterministicTimeoutExecutor,
  createProviderTimeoutPolicy,
  DeterministicProviderExecutionAttemptReferenceFactory,
  FakeProviderAdapter,
  InMemoryProviderRegistry,
  ProviderRuntime,
  ProviderSelectionPolicy,
  SENTINEL_FAKE_PROVIDER_SECRET,
  type ProviderRuntimePort,
} from '@dap/provider-runtime';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../fulfillment/fulfillment-pipeline-step-types.js';

const PRODUCT_REFERENCE = 'digital-premium-12m';
const INVENTORY_ITEM_REFERENCE = createInventoryItemReference(PRODUCT_REFERENCE);

const ALL_SENTINELS = [
  SENTINEL_FAKE_PROVIDER_SECRET,
  'SUPER_SECRET_PROVIDER_PASSWORD',
  'SUPER_SECRET_BEARER_TOKEN',
  'SUPER_SECRET_PROVIDER_RESPONSE',
  'SUPER_SECRET_EXCEPTION_MESSAGE',
  'SUPER_SECRET_STACK_TRACE',
  'SUPER_SECRET_DELIVERY_PASSWORD',
] as const;

const assertSentinelsAbsent = (serialized: string): void => {
  for (const sentinel of ALL_SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
};

const processEnvelope = async (
  stack: InboundGatewayStack,
  overrides: Parameters<typeof createValidExternalOrderPaidEnvelope>[0] = {},
) => {
  const envelope = createValidExternalOrderPaidEnvelope(overrides);
  return stack.inboundGateway.process(envelope, stack.inboundAdapter);
};

const createFulfillmentRequest = (quantity = 1) =>
  createDigitalFulfillmentRequest({
    eventId: 'evt-workflow-001',
    eventType: 'order.paid',
    externalOrderReference: 'order-1001',
    customerReference: 'customer-42',
    customerEmail: 'customer@example.com',
    productReference: PRODUCT_REFERENCE,
    quantity,
    occurredAt: new Date('2026-07-19T10:00:00.000Z'),
  });

const createEmptyRegistryProviderRuntime = (clock: FakeClock): ProviderRuntimePort => {
  const timeoutPolicyResult = createProviderTimeoutPolicy({
    defaultTimeoutMilliseconds: 30_000,
  });

  if (!timeoutPolicyResult.ok) {
    throw new Error('Failed to create provider timeout policy.');
  }

  return new ProviderRuntime({
    registry: new InMemoryProviderRegistry(),
    selectionPolicy: new ProviderSelectionPolicy(),
    attemptReferenceFactory: new DeterministicProviderExecutionAttemptReferenceFactory('attempt'),
    clock,
    timeoutPolicy: timeoutPolicyResult.value,
    timeoutExecutor: createDeterministicTimeoutExecutor(),
  });
};

const createTimeoutProviderRuntimeStack = (
  clock: FakeClock,
): {
  providerRuntime: ProviderRuntimePort;
  fakeAdapter: FakeProviderAdapter;
  timeoutExecutor: DeterministicTimeoutExecutor;
} => {
  const stack = createTestProviderRuntimeStack({ clock });
  stack.timeoutExecutor.setMode('timeout');
  return stack;
};

type CustomFulfillmentStack = {
  clock: FakeClock;
  inventoryReservationRepository: InMemoryInventoryReservationRepository;
  failingRepository: InMemoryInventoryReservationRepository;
  inventoryReservationService: InventoryReservationService;
  fakeProviderAdapter: FakeProviderAdapter | undefined;
  notificationAdapter: InMemoryCustomerNotificationAdapter;
  fulfillmentService: DigitalFulfillmentService;
};

const createCustomFulfillmentStack = async (options?: {
  inventoryQuantity?: number;
  failingRepository?: ReturnType<typeof createFailingInventoryReservationRepository>;
  providerRuntimePort?: ProviderRuntimePort;
  fakeProviderAdapter?: FakeProviderAdapter;
}): Promise<CustomFulfillmentStack> => {
  const clock = new FakeClock();
  const productReference = PRODUCT_REFERENCE;
  const inventoryQuantity = options?.inventoryQuantity ?? 5;
  const baseRepository = new InMemoryInventoryReservationRepository();
  const inventoryReservationRepository =
    options?.failingRepository ?? createFailingInventoryReservationRepository(baseRepository);
  const inventoryReservationService = new InventoryReservationService({
    repository: inventoryReservationRepository,
    clock,
    reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
  });
  const inventoryReservationAdapter = new QuantityInventoryReservationAdapter(
    inventoryReservationService,
  );

  const providerRuntimeStack =
    options?.providerRuntimePort === undefined
      ? createTestProviderRuntimeStack({ clock })
      : undefined;
  const providerRuntimePort = options?.providerRuntimePort ?? providerRuntimeStack!.providerRuntime;
  const fakeProviderAdapter = options?.fakeProviderAdapter ?? providerRuntimeStack?.fakeAdapter;

  const notificationAdapter = new InMemoryCustomerNotificationAdapter();
  const automationRepository = new InMemoryAutomationDefinitionRepository();
  const workflowDefinitionRepository = new InMemoryWorkflowDefinitionRepository();

  const inventoryRecordResult = createQuantityInventoryRecord({
    inventoryItemReference: INVENTORY_ITEM_REFERENCE,
    totalQuantity: inventoryQuantity,
  });

  if (!inventoryRecordResult.ok) {
    throw new Error('Failed to seed inventory record.');
  }

  await inventoryReservationRepository.saveInventoryItem(inventoryRecordResult.value);
  await workflowDefinitionRepository.save(createDigitalProductFulfillmentWorkflowDefinition());
  await automationRepository.save(
    AutomationDefinition.create({
      id: createIdentifier('AutomationDefinition', 'digital-premium-fulfillment'),
      name: 'digital-premium-fulfillment',
      trigger: AutomationTrigger.create('order.paid'),
      workflowReference: DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE,
      priority: 100,
      conditions: ConditionGroup.create({
        mode: 'ALL',
        conditions: [
          AutomationCondition.create({
            fieldPath: 'product.reference',
            operator: 'equals',
            expectedValue: productReference,
          }),
        ],
      }),
    }),
  );

  const stepRegistry = createDigitalFulfillmentStepRegistry({
    inventoryReservationPort: inventoryReservationAdapter,
    reservationLifecyclePort: inventoryReservationAdapter,
    providerRuntimePort,
    notificationPort: notificationAdapter,
    clock,
  });
  const pipelineRunner = new PipelineRunner({ stepExecutorRegistry: stepRegistry, clock });
  const workflowExecutionPort = new PipelineWorkflowExecutionPort({
    pipelineRunner,
    workflowDefinitionRepository,
  });
  const matcher = new AutomationMatcher({ repository: automationRepository });
  const orchestrator = new PlatformEventOrchestrator({
    matcher,
    workflowExecutionPort,
  });
  const fulfillmentService = new DigitalFulfillmentService({ orchestrator });

  return {
    clock,
    inventoryReservationRepository: baseRepository,
    failingRepository: inventoryReservationRepository,
    inventoryReservationService,
    fakeProviderAdapter,
    notificationAdapter,
    fulfillmentService,
  };
};

const getPipelineResult = (result: Awaited<ReturnType<typeof processEnvelope>>) =>
  result.orchestrationResult?.executionOutcomes[0]?.pipelineExecutionResult;

describe('Sprint 19 workflow integration — workflow mapping [O]', () => {
  it('[O1][O2][O3][O4][O5][O6] maps reserve output into provider runtime request', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');

    const pipelineResult = getPipelineResult(result);
    const reserveStep = pipelineResult?.completedSteps.find(
      (step) => step.stepName === 'Reserve Inventory',
    );
    const invocation = stack.fakeProviderAdapter.getInvocations()[0];

    expect(invocation).toBeDefined();
    expect(invocation!.reservationReference).toBe(reserveStep?.output?.reservationReference);
    expect(invocation!.inventoryItemReference).toBe(reserveStep?.output?.inventoryItemReference);
    expect(invocation!.quantity).toBe(reserveStep?.output?.quantity);
    expect(invocation!.inventoryItemReference).toBe(INVENTORY_ITEM_REFERENCE);
    expect(invocation!.reservationReference).not.toBe(invocation!.inventoryItemReference);
  });

  it('[O7] does not default quantity when reserve output omits quantity', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    const inventoryRecordResult = createQuantityInventoryRecord({
      inventoryItemReference: INVENTORY_ITEM_REFERENCE,
      totalQuantity: 10,
    });

    if (!inventoryRecordResult.ok) {
      throw new Error('Failed to seed inventory record.');
    }

    await repository.saveInventoryItem(inventoryRecordResult.value);
    const service = new InventoryReservationService({
      repository,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('rev'),
    });
    const adapter = new QuantityInventoryReservationAdapter(service);
    const providerRuntimeStack = createTestProviderRuntimeStack({ clock });
    const notificationAdapter = new InMemoryCustomerNotificationAdapter();
    const registry = createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: adapter,
      reservationLifecyclePort: adapter,
      providerRuntimePort: providerRuntimeStack.providerRuntime,
      notificationPort: notificationAdapter,
      clock,
    });

    const invalidReserveOutput = createPipelineStepExecutionResult({
      stepId: createIdentifier('PipelineStep', 'step-reserve'),
      stepName: 'Reserve Inventory',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
      status: 'succeeded',
      startedAt: clock.now(),
      completedAt: clock.now(),
      output: {
        reservationReference: 'res-no-default-qty',
        inventoryItemReference: INVENTORY_ITEM_REFERENCE,
      },
    });

    const context = createPipelineStepExecutionContext({
      executionId: createIdentifier('PipelineExecution', 'exec-o7'),
      workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-o7'),
      runId: 'run-o7',
      input: {
        eventId: 'evt-o7',
        eventType: 'order.paid',
        externalOrderReference: 'order-o7',
        customerReference: 'cust-o7',
        productReference: PRODUCT_REFERENCE,
        quantity: 99,
      },
      metadata: { executionRunId: 'run-o7' },
      priorStepOutputs: [invalidReserveOutput],
    });

    const result = await registry.execute(context, {
      id: createIdentifier('PipelineStep', 'step-provision'),
      name: 'Provision Digital Product',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
      order: 2,
    });

    expect(result.status).toBe('failed');
    expect(result.output?.failureCode).toBe('invalid-reserved-quantity');
    expect(providerRuntimeStack.fakeAdapter.getInvocationCount()).toBe(0);
  });

  it('[O8][O9][O10][O11][O12] maps capability, fulfillment definition, and omits credentials', async () => {
    const stack = await createTestInboundGatewayStack();
    await processEnvelope(stack);

    const invocation = stack.fakeProviderAdapter.getInvocations()[0];
    expect(invocation?.capability).toBe('digital-subscription-provisioning');
    expect(invocation?.businessIdempotencyReference).toBeDefined();
    expect(invocation?.businessIdempotencyReference).not.toContain('order-1001');
    expect(JSON.stringify(invocation)).not.toContain(SENTINEL_FAKE_PROVIDER_SECRET);
    expect(JSON.stringify(invocation)).not.toContain('credential-');
  });
});

describe('Sprint 19 workflow integration — success path [P]', () => {
  it('[P1][P2][P3][P4] runtime success leads to consume then notify in order', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);
    const pipelineResult = getPipelineResult(result);
    const stepNames = pipelineResult?.completedSteps.map((step) => step.stepName) ?? [];

    expect(result.status).toBe('processed');
    expect(stepNames.indexOf('Provision Digital Product')).toBeLessThan(
      stepNames.indexOf('Consume Reservation'),
    );
    expect(stepNames.indexOf('Consume Reservation')).toBeLessThan(
      stepNames.indexOf('Notify Customer'),
    );
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('[P5][P6][P7] preserves safe provider evidence and external provisioning reference', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);
    const provisionStep = getPipelineResult(result)?.completedSteps.find(
      (step) => step.stepName === 'Provision Digital Product',
    );

    expect(provisionStep?.output?.providerReference).toBeDefined();
    expect(provisionStep?.output?.executionAttemptReference).toBeDefined();
    expect(provisionStep?.output?.externalProvisioningReference).toBeDefined();
    expect(provisionStep?.output?.deliveryMaterialReference).toBeDefined();
    expect(provisionStep?.output?.safeEvidence).toBeDefined();
  });

  it('[P8][P9][P10] does not release reservation on success path', async () => {
    const stack = await createTestInboundGatewayStack();
    await processEnvelope(stack);

    const reservations = stack.inventoryReservationRepository.inspectAllReservations();
    expect(reservations.some((reservation) => reservation.status === 'consumed')).toBe(true);
    expect(reservations.some((reservation) => reservation.status === 'released')).toBe(false);
  });

  it('[P11][P12][P13] execution run completes without secrets in output or audit', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);
    const run = await stack.executionRunRepository.findById(result.executionRunId!);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(run?.status).toBe('completed');
    assertSentinelsAbsent(JSON.stringify(run));
    assertSentinelsAbsent(JSON.stringify(audit));
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 19 workflow integration — provider failure paths [Q]', () => {
  const expectProvisioningFailureCleanup = async (
    stack: InboundGatewayStack | CustomFulfillmentStack,
    expectedFailureCode: string,
    options?: { adapterInvoked?: boolean },
  ) => {
    const before =
      await stack.inventoryReservationRepository.findInventoryItemByReference(
        INVENTORY_ITEM_REFERENCE,
      );
    const result =
      'inboundGateway' in stack
        ? await processEnvelope(stack)
        : await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.status).toBe('failed');

    if ('inboundGateway' in stack) {
      const pipelineResult = getPipelineResult(result);
      expect(pipelineResult?.failedStep?.stepName).toBe('Provision Digital Product');
      expect(pipelineResult?.failedStep?.output?.failureCode).toBe(expectedFailureCode);
      expect(
        pipelineResult?.completedSteps.some((step) => step.stepName === 'Consume Reservation'),
      ).toBe(false);
    } else {
      expect(result.provisioningOutcome.status).toBe('failed');
      expect(result.provisioningOutcome.failureCode).toBe(expectedFailureCode);
      expect(result.completedPipelineSteps).not.toContain('Consume Reservation');
    }

    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);

    const after =
      await stack.inventoryReservationRepository.findInventoryItemByReference(
        INVENTORY_ITEM_REFERENCE,
      );
    expect(computeAvailableQuantity(after!)).toBe(computeAvailableQuantity(before!));

    if (stack.fakeProviderAdapter !== undefined) {
      const expectedInvocations = options?.adapterInvoked === false ? 0 : 1;
      expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(expectedInvocations);
    }

    assertSentinelsAbsent(JSON.stringify(result));
  };

  it('[Q1] selection failure with empty registry releases reservation and skips notification', async () => {
    const clock = new FakeClock();
    const stack = await createCustomFulfillmentStack({
      providerRuntimePort: createEmptyRegistryProviderRuntime(clock),
    });

    await expectProvisioningFailureCleanup(stack, 'PROVIDER_SELECTION_FAILED', {
      adapterInvoked: false,
    });
  });

  it('[Q2] provider rejection releases reservation exactly once', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('rejected');
    await expectProvisioningFailureCleanup(stack, 'PROVIDER_REJECTED');
  });

  it('[Q3] provider unavailable releases reservation exactly once', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('unavailable');
    await expectProvisioningFailureCleanup(stack, 'PROVIDER_UNAVAILABLE');
  });

  it('[Q4] provider exception releases reservation exactly once', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('throw');
    stack.fakeProviderAdapter.setConfiguredException(new Error('SUPER_SECRET_EXCEPTION_MESSAGE'));
    await expectProvisioningFailureCleanup(stack, 'PROVIDER_EXECUTION_FAILED');
  });

  it('[Q5] provider timeout releases reservation exactly once', async () => {
    const clock = new FakeClock();
    const runtimeStack = createTimeoutProviderRuntimeStack(clock);
    const stack = await createCustomFulfillmentStack({
      providerRuntimePort: runtimeStack.providerRuntime,
      fakeProviderAdapter: runtimeStack.fakeAdapter,
    });

    await expectProvisioningFailureCleanup(stack, 'PROVIDER_TIMEOUT');
    expect(runtimeStack.fakeAdapter.getInvocationCount()).toBe(1);
  });
});

describe('Sprint 19 workflow integration — cleanup failure [R]', () => {
  it('[R1][R7] release typed failure after provider rejection invokes release exactly once', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const stack = await createCustomFulfillmentStack({ failingRepository: failingRepo });

    stack.fakeProviderAdapter!.setMode('rejected');
    failingRepo.failNextRelease();

    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.failureCode).toBe('partial-processing');
    expect(result.failedStep).toBe('Provision Digital Product');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
    expect(stack.fakeProviderAdapter!.getInvocationCount()).toBe(1);
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[R2][R4][R7] successful release after provider rejection invokes release exactly once', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('rejected');
    await processEnvelope(stack);

    const reservations = stack.inventoryReservationRepository.inspectAllReservations();
    expect(reservations.filter((reservation) => reservation.status === 'released')).toHaveLength(1);
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('[R3][R6] release exception after provider failure returns partial-processing safely', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    const inventoryRecordResult = createQuantityInventoryRecord({
      inventoryItemReference: INVENTORY_ITEM_REFERENCE,
      totalQuantity: 10,
    });

    if (!inventoryRecordResult.ok) {
      throw new Error('Failed to seed inventory record.');
    }

    await repository.saveInventoryItem(inventoryRecordResult.value);
    const service = new InventoryReservationService({
      repository,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });
    const adapter = new QuantityInventoryReservationAdapter(service);
    let releaseCount = 0;
    const providerRuntimeStack = createTestProviderRuntimeStack({ clock });
    providerRuntimeStack.fakeAdapter.setMode('rejected');
    const lifecycleAdapter = {
      releaseReservation: async (_reservationReference: string) => {
        releaseCount += 1;
        throw new Error('SUPER_SECRET_EXCEPTION_MESSAGE');
      },
      consumeReservation: adapter.consumeReservation.bind(adapter),
    };
    const notificationAdapter = new InMemoryCustomerNotificationAdapter();
    const registry = createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: adapter,
      reservationLifecyclePort: lifecycleAdapter,
      providerRuntimePort: providerRuntimeStack.providerRuntime,
      notificationPort: notificationAdapter,
      clock,
    });

    const reserveOutput = createPipelineStepExecutionResult({
      stepId: createIdentifier('PipelineStep', 'step-reserve'),
      stepName: 'Reserve Inventory',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
      status: 'succeeded',
      startedAt: clock.now(),
      completedAt: clock.now(),
      output: {
        reservationReference: 'res-cleanup-r3',
        inventoryItemReference: INVENTORY_ITEM_REFERENCE,
        quantity: 1,
        status: 'reserved',
      },
    });

    const context = createPipelineStepExecutionContext({
      executionId: createIdentifier('PipelineExecution', 'exec-r3'),
      workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-r3'),
      runId: 'run-r3',
      input: {
        eventId: 'evt-r3',
        eventType: 'order.paid',
        externalOrderReference: 'order-r3',
        customerReference: 'cust-r3',
        productReference: PRODUCT_REFERENCE,
        quantity: 1,
      },
      metadata: { executionRunId: 'run-r3' },
      priorStepOutputs: [reserveOutput],
    });

    const result = await registry.execute(context, {
      id: createIdentifier('PipelineStep', 'step-provision'),
      name: 'Provision Digital Product',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
      order: 2,
    });

    expect(releaseCount).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.output?.failureCode).toBe('partial-processing');
    expect(result.output?.releaseFailureCode).toBe('release-exception');
    expect(notificationAdapter.getSentNotifications()).toHaveLength(0);
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 19 workflow integration — consumption failure [S]', () => {
  it('[S1][S2][S3][S4][S5] provider success with consumption failure returns partial-processing', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const stack = await createCustomFulfillmentStack({ failingRepository: failingRepo });

    failingRepo.failNextConsume();
    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.status).toBe('provisioned');
    expect(result.provisioningOutcome.externalProvisioningReference).toBeDefined();
    expect(result.notificationOutcome.status).toBe('notAttempted');
    expect(result.inventoryOutcome.status).toBe('reserved');
    expect(result.failedStep).toBe('Consume Reservation');
    expect(stack.fakeProviderAdapter!.getInvocationCount()).toBe(1);
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[S6][S7][S8] does not retry provider or perform ordinary release cleanup', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const stack = await createCustomFulfillmentStack({ failingRepository: failingRepo });

    failingRepo.failNextConsume();
    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.inventoryOutcome.status).toBe('reserved');
    expect(result.inventoryOutcome.reservationStatus).not.toBe('released');
    expect(stack.fakeProviderAdapter!.getInvocationCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('[S9][S10][S11][S12] sentinel values do not appear in workflow output or execution-run audit', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('throw');
    stack.fakeProviderAdapter.setConfiguredException(new Error('SUPER_SECRET_EXCEPTION_MESSAGE'));

    const failureResult = await processEnvelope(stack);
    assertSentinelsAbsent(JSON.stringify(failureResult));

    if (failureResult.executionRunId !== undefined) {
      const audit = await stack.executionRunCoordinator.getAuditRecord(
        failureResult.executionRunId,
      );
      assertSentinelsAbsent(JSON.stringify(audit));
    }

    stack.fakeProviderAdapter.reset();
    stack.fakeProviderAdapter.setMode('success');
    const successResult = await processEnvelope(stack, { externalEventId: 'sentinel-success-001' });
    const run = await stack.executionRunRepository.findById(successResult.executionRunId!);
    const successAudit = await stack.executionRunCoordinator.getAuditRecord(
      successResult.executionRunId!,
    );

    assertSentinelsAbsent(JSON.stringify(run));
    assertSentinelsAbsent(JSON.stringify(successAudit));
    assertSentinelsAbsent(JSON.stringify(successResult));
  });
});
