import { describe, expect, it } from 'vitest';

import {
  createTestInboundGatewayStack,
  type InboundGatewayStack,
} from '../../testing/create-test-inbound-gateway-stack.js';
import { createValidExternalOrderPaidEnvelope } from '../inbound-event/fake-inbound-event-adapter.js';
import { createDigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { createTestDigitalFulfillmentStack } from '../../testing/create-test-digital-fulfillment-stack.js';
import { CustomerNotificationError } from '../../domain/notification/errors/notification-errors.js';
import { createTestProviderRuntimeStack } from '@dap/provider-runtime';
import { FakeClock } from '../../shared/time/clock.js';
import {
  createFailingInventoryReservationRepository,
  InMemoryInventoryReservationRepository,
} from '../../domain/inventory/in-memory-inventory-reservation-repository.js';
import { InventoryReservationService } from './inventory-reservation-service.js';
import { DeterministicReservationReferenceFactory } from './reservation-policy.js';
import { QuantityInventoryReservationAdapter } from '../fulfillment/adapters/quantity-inventory-reservation-adapter.js';
import { createQuantityInventoryRecord } from '../../domain/inventory/quantity-inventory-record.js';
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
import { computeAvailableQuantity } from '../../domain/inventory/quantity-inventory-record.js';

const PRODUCT_REFERENCE = 'digital-premium-12m';

const processEnvelope = async (
  stack: InboundGatewayStack,
  overrides: Parameters<typeof createValidExternalOrderPaidEnvelope>[0] = {},
) => {
  const envelope = createValidExternalOrderPaidEnvelope(overrides);
  return stack.inboundGateway.process(envelope, stack.inboundAdapter);
};

const createFulfillmentRequest = () =>
  createDigitalFulfillmentRequest({
    eventId: 'evt-workflow-001',
    eventType: 'order.paid',
    externalOrderReference: 'order-1001',
    customerReference: 'customer-42',
    customerEmail: 'customer@example.com',
    productReference: PRODUCT_REFERENCE,
    quantity: 1,
    occurredAt: new Date('2026-07-19T10:00:00.000Z'),
  });

const createCustomFulfillmentStack = async (options?: {
  inventoryQuantity?: number;
  failingRepository?: ReturnType<typeof createFailingInventoryReservationRepository>;
}) => {
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
  const testProviderRuntime = createTestProviderRuntimeStack({ clock });
  const fakeProviderAdapter = testProviderRuntime.fakeAdapter;
  const notificationAdapter = new InMemoryCustomerNotificationAdapter();
  const automationRepository = new InMemoryAutomationDefinitionRepository();
  const workflowDefinitionRepository = new InMemoryWorkflowDefinitionRepository();

  const inventoryItemReference = createInventoryItemReference(productReference);
  const inventoryRecordResult = createQuantityInventoryRecord({
    inventoryItemReference,
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
    providerRuntimePort: testProviderRuntime.providerRuntime,
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

describe('Sprint 18 workflow integration — success path [S113-S124]', () => {
  it('[S113][S114][S115][S116][S117][S118][S119][S120][S121] successful workflow reserves, provisions, consumes, and notifies in order', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);

    const fulfillmentResult =
      result.orchestrationResult?.executionOutcomes[0]?.pipelineExecutionResult;
    const reserveStep = fulfillmentResult?.completedSteps.find(
      (step) => step.stepName === 'Reserve Inventory',
    );
    const consumeStep = fulfillmentResult?.completedSteps.find(
      (step) => step.stepName === 'Consume Reservation',
    );

    expect(reserveStep?.output?.reservationReference).toBeDefined();
    expect(consumeStep?.output?.reservationReference).toBe(
      reserveStep?.output?.reservationReference,
    );
    expect(consumeStep?.output?.status).toBe('consumed');
  });

  it('[S122] execution run reaches successful terminal state', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.executionRunId).toBeDefined();
    const run = await stack.executionRunRepository.findById(result.executionRunId!);
    expect(run?.status).toBe('completed');
  });

  it('[S123][S124] audit includes safe reservation fields and excludes repository internals', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);
    const run = await stack.executionRunRepository.findById(result.executionRunId!);
    const serialized = JSON.stringify(run);

    expect(serialized).toContain('Reserve Inventory');
    expect(serialized).not.toContain('itemLocks');
    expect(serialized).not.toContain('reservationsByOwnerKey');
  });
});

describe('Sprint 18 workflow integration — provisioning failure and release [S125-S133]', () => {
  it('[S125][S126][S127][S128][S129] provisioning failure triggers release and skips notification', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.fakeProviderAdapter.setMode('rejected');

    const before = await stack.inventoryReservationRepository.findInventoryItemByReference(
      createInventoryItemReference(PRODUCT_REFERENCE),
    );
    const result = await processEnvelope(stack);

    expect(result.status).toBe('failed');
    expect(result.orchestrationResult?.overallStatus).toBe('failed');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);

    const fulfillment = result.orchestrationResult?.executionOutcomes[0];
    expect(fulfillment?.pipelineExecutionResult?.failedStep?.stepName).toBe(
      'Provision Digital Product',
    );

    const after = await stack.inventoryReservationRepository.findInventoryItemByReference(
      createInventoryItemReference(PRODUCT_REFERENCE),
    );
    expect(computeAvailableQuantity(after!)).toBe(computeAvailableQuantity(before!));
    expect(result.orchestrationResult?.overallStatus).toBe('failed');
  });

  it('[S130][S131][S132][S133] release failure after provisioning failure is surfaced safely', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const stack = await createCustomFulfillmentStack({ failingRepository: failingRepo });

    stack.fakeProviderAdapter.setMode('rejected');
    failingRepo.failNextRelease();

    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.status).toBe('failed');
    expect(result.provisioningOutcome.failureCode).toBe('partial-processing');
    expect(result.failedStep).toBe('Provision Digital Product');
    expect(JSON.stringify(result)).not.toContain('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });
});

describe('Sprint 18 workflow integration — consumption failure [S134-S141]', () => {
  it('[S134][S135][S136][S137][S138][S139][S140][S141] provisioning success with consumption failure returns partial-processing safely', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const stack = await createCustomFulfillmentStack({ failingRepository: failingRepo });

    failingRepo.failNextConsume();
    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.status).toBe('provisioned');
    expect(result.notificationOutcome.status).toBe('notAttempted');
    expect(result.inventoryOutcome.status).toBe('reserved');
    expect(result.failedStep).toBe('Consume Reservation');
    expect(JSON.stringify(result)).not.toContain('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
  });
});

describe('Sprint 18 workflow integration — notification failure [S142-S147]', () => {
  it('[S142][S143][S144][S145][S146][S147] notification failure preserves consumed reservation and hides credentials', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.notificationAdapter.configureError(
      new CustomerNotificationError('Delivery failed.', 'NOTIFICATION_FAILED'),
    );

    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    const auditSerialized = JSON.stringify(audit);

    expect(result.status).toBe('failed');
    expect(result.orchestrationResult?.overallStatus).toBe('failed');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);

    const reservations = stack.inventoryReservationRepository.inspectAllReservations();
    expect(reservations.some((reservation) => reservation.status === 'consumed')).toBe(true);

    expect(auditSerialized).not.toContain('secret-order-1001-1');
    expect(auditSerialized).not.toContain('SENTINEL_PROVISIONING_PASSWORD_DO_NOT_LEAK');
  });
});

describe('Sprint 18 workflow integration — direct fulfillment service', () => {
  it('provisioning does not run without a valid reservation', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 0 });
    const result = await stack.fulfillmentService.fulfill(createFulfillmentRequest());

    expect(result.failedStep).toBe('Reserve Inventory');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(0);
  });

  it('duplicate inbound delivery executes fulfillment once', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    const first = await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const second = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
    expect(stack.inventoryReservationRepository.inspectAllReservations()).toHaveLength(1);
  });
});
