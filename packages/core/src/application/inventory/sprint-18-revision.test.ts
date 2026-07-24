import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../shared/time/clock.js';
import { InventoryReservationService } from '../inventory/inventory-reservation-service.js';
import {
  DeterministicReservationReferenceFactory,
  SequentialReservationReferenceFactory,
} from '../inventory/reservation-policy.js';
import {
  createFailingInventoryReservationRepository,
  InMemoryInventoryReservationRepository,
} from '../../domain/inventory/in-memory-inventory-reservation-repository.js';
import {
  createInventoryItemReference,
  createReservationReference,
  type ReservationOwnerReference,
} from '../../domain/inventory/inventory-references.js';
import { createQuantityInventoryRecord } from '../../domain/inventory/quantity-inventory-record.js';
import { createTestInboundGatewayStack } from '../../testing/create-test-inbound-gateway-stack.js';
import { createValidExternalOrderPaidEnvelope } from '../inbound-event/fake-inbound-event-adapter.js';
import { createTestProviderRuntimeStack } from '@dap/provider-runtime';
import type { ReleaseReservationOutcome } from '../inventory/reservation-results.js';
import { createDigitalFulfillmentStepRegistry } from '../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import { QuantityInventoryReservationAdapter } from '../fulfillment/adapters/quantity-inventory-reservation-adapter.js';
import { InMemoryCustomerNotificationAdapter } from '../fulfillment/adapters/in-memory-customer-notification-adapter.js';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../fulfillment/fulfillment-pipeline-step-types.js';
import { createPipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';

const ITEM_REF = createInventoryItemReference('revision-item-001');
const OWNER = 'run-revision-001' as ReservationOwnerReference;
const PRODUCT_REFERENCE = 'digital-premium-12m';

const seedInventory = async (
  repository: InMemoryInventoryReservationRepository,
  totalQuantity = 10,
): Promise<void> => {
  const record = createQuantityInventoryRecord({
    inventoryItemReference: ITEM_REF,
    totalQuantity,
  });

  if (!record.ok) {
    throw new Error('Failed to seed inventory.');
  }

  await repository.saveInventoryItem(record.value);
};

const createService = (params: {
  repository: InMemoryInventoryReservationRepository;
  clock?: FakeClock;
  factoryPrefix: string;
}): InventoryReservationService =>
  new InventoryReservationService({
    repository: params.repository,
    clock: params.clock ?? new FakeClock(new Date('2026-07-20T08:00:00.000Z')),
    reservationReferenceFactory: new DeterministicReservationReferenceFactory(params.factoryPrefix),
  });

const reserveOne = async (service: InventoryReservationService) => {
  const outcome = await service.reserveInventory({
    ownerReference: OWNER,
    inventoryItemReference: ITEM_REF,
    quantity: 1,
    reservationDurationMs: 60_000,
  });

  if (outcome.kind !== 'reservation-created' && outcome.kind !== 'reservation-duplicate') {
    throw new Error(`Expected reservation, received ${outcome.kind}`);
  }

  return outcome;
};

describe('Sprint 18 revision — invalid transition reports actual reservation state', () => {
  it('release consumed reservation reports actual consumed state', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, factoryPrefix: 'rev' });
    const reserved = await reserveOne(service);
    await service.consumeReservation({ reservationReference: reserved.reservationReference });

    const outcome = await service.releaseReservation({
      reservationReference: reserved.reservationReference,
    });

    expect(outcome.kind).toBe('reservation-already-terminal');
    if (outcome.kind === 'reservation-already-terminal') {
      expect(outcome.status).toBe('consumed');
      expect(outcome.reservationReference).toBe(reserved.reservationReference);
      expect(outcome.ownerReference).toBe(OWNER);
      expect(outcome.inventoryItemReference).toBe(ITEM_REF);
      expect(outcome.quantity).toBe(1);
      expect(outcome.ownerReference).not.toBe('');
      expect(outcome.quantity).not.toBe(0);
    }
  });

  it('consume released reservation reports actual released state', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, factoryPrefix: 'rev' });
    const reserved = await reserveOne(service);
    await service.releaseReservation({ reservationReference: reserved.reservationReference });

    const outcome = await service.consumeReservation({
      reservationReference: reserved.reservationReference,
    });

    expect(outcome.kind).toBe('reservation-already-terminal');
    if (outcome.kind === 'reservation-already-terminal') {
      expect(outcome.status).toBe('released');
      expect(outcome.quantity).toBe(1);
    }
  });

  it('consume expired reservation reports actual expired state', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, clock, factoryPrefix: 'rev' });
    const reserved = await reserveOne(service);
    clock.advanceMs(60_000);
    await service.expireReservation({ reservationReference: reserved.reservationReference });

    const outcome = await service.consumeReservation({
      reservationReference: reserved.reservationReference,
    });

    expect(outcome.kind).toBe('reservation-already-terminal');
    if (outcome.kind === 'reservation-already-terminal') {
      expect(outcome.status).toBe('expired');
      expect(outcome.quantity).toBe(1);
    }
  });
});

describe('Sprint 18 revision — reservation reference factory injection', () => {
  it('requires an explicit reference factory at construction', () => {
    expect(
      () =>
        new InventoryReservationService({
          repository: new InMemoryInventoryReservationRepository(),
          clock: new FakeClock(),
          reservationReferenceFactory: new DeterministicReservationReferenceFactory('test'),
        }),
    ).not.toThrow();
  });

  it('prevents independent services from silently generating duplicate references on a shared repository', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository, 20);

    const serviceA = new InventoryReservationService({
      repository,
      clock: new FakeClock(),
      reservationReferenceFactory: new SequentialReservationReferenceFactory('service-a'),
    });
    const serviceB = new InventoryReservationService({
      repository,
      clock: new FakeClock(),
      reservationReferenceFactory: new SequentialReservationReferenceFactory('service-b'),
    });

    const first = await serviceA.reserveInventory({
      ownerReference: 'run-a' as ReservationOwnerReference,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationDurationMs: 60_000,
    });
    const second = await serviceB.reserveInventory({
      ownerReference: 'run-b' as ReservationOwnerReference,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationDurationMs: 60_000,
    });

    expect(first.kind).toBe('reservation-created');
    expect(second.kind).toBe('reservation-created');
    if (first.kind === 'reservation-created' && second.kind === 'reservation-created') {
      expect(first.reservationReference).not.toBe(second.reservationReference);
    }
  });
});

describe('Sprint 18 revision — expireDueReservations safety', () => {
  it('returns repository-failed when lookup throws', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    await seedInventory(baseRepo);
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const service = createService({ repository: failingRepo, factoryPrefix: 'rev' });
    failingRepo.failNextFindDue();

    const outcome = await service.expireDueReservations();
    expect(outcome.kind).toBe('repository-failed');
    if (outcome.kind === 'repository-failed') {
      expect(outcome.reasonCode).toBe('find-due-reservations-exception');
      expect(JSON.stringify(outcome)).not.toContain('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
    }
  });

  it('rejects invalid Date for expire-due command', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, factoryPrefix: 'rev' });

    const outcome = await service.expireDueReservations({ now: new Date('invalid') });
    expect(outcome.kind).toBe('invalid-expiration-time');
  });

  it('clones expire-due Date input so mutation cannot alter operation state', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, clock, factoryPrefix: 'rev' });

    await service.reserveInventory({
      ownerReference: OWNER,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationReference: 'res-mutable-date',
      reservationDurationMs: 500,
    });

    clock.advanceMs(500);
    const now = clock.now();
    const outcomeBeforeMutation = await service.expireDueReservations({ now });
    now.setTime(now.getTime() + 86_400_000);

    const outcomeAfterMutation = await service.expireDueReservations({ now: clock.now() });

    expect(outcomeBeforeMutation.kind).toBe('expiration-summary');
    expect(outcomeAfterMutation.kind).toBe('expiration-summary');
    if (
      outcomeBeforeMutation.kind === 'expiration-summary' &&
      outcomeAfterMutation.kind === 'expiration-summary'
    ) {
      expect(outcomeBeforeMutation.expiredCount).toBe(1);
      expect(outcomeAfterMutation.expiredCount).toBe(0);
    }
  });
});

describe('Sprint 18 revision — reference validation', () => {
  it.each([
    ['', 'empty-reference'],
    ['   ', 'whitespace-only-reference'],
    ['  ref ', 'malformed-reference'],
    [123, 'non-string-reference'],
  ])('rejects invalid consume reference %s', async (reference, reasonCode) => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, factoryPrefix: 'rev' });

    const outcome = await service.consumeReservation({
      reservationReference: reference as string,
    });

    expect(outcome.kind).toBe('invalid-reservation-reference');
    if (outcome.kind === 'invalid-reservation-reference') {
      expect(outcome.reasonCode).toBe(reasonCode);
    }
    expect(repository.inspectAllReservations()).toHaveLength(0);
  });

  it('rejects invalid release and expire references without repository transition', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, factoryPrefix: 'rev' });
    const reserved = await reserveOne(service);

    const releaseOutcome = await service.releaseReservation({ reservationReference: '   ' });
    const expireOutcome = await service.expireReservation({ reservationReference: '' });

    expect(releaseOutcome.kind).toBe('invalid-reservation-reference');
    expect(expireOutcome.kind).toBe('invalid-reservation-reference');
    expect(
      repository.inspectReservation(createReservationReference(reserved.reservationReference))
        ?.status,
    ).toBe('reserved');
  });
});

describe('Sprint 18 revision — workflow Clock and provisioning identity', () => {
  it('uses injected Clock for fulfillment step timestamps', async () => {
    const clock = new FakeClock(new Date('2026-07-20T12:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, clock, factoryPrefix: 'rev' });
    const adapter = new QuantityInventoryReservationAdapter(service);
    const testProviderRuntime = createTestProviderRuntimeStack({ clock });
    const notificationAdapter = new InMemoryCustomerNotificationAdapter();
    const registry = createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: adapter,
      reservationLifecyclePort: adapter,
      providerRuntimePort: testProviderRuntime.providerRuntime,
      notificationPort: notificationAdapter,
      clock,
    });

    const context = createPipelineStepExecutionContext({
      executionId: createIdentifier('PipelineExecution', 'exec-1'),
      workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-1'),
      runId: 'run-clock-test',
      input: {
        eventId: 'evt-1',
        eventType: 'order.paid',
        externalOrderReference: 'order-1',
        customerReference: 'cust-1',
        productReference: ITEM_REF,
        quantity: 1,
      },
      metadata: { executionRunId: OWNER },
      priorStepOutputs: [],
    });

    const step = {
      id: createIdentifier('PipelineStep', 'step-reserve'),
      name: 'Reserve Inventory',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
      order: 1,
    };

    const result = await registry.execute(context, step);
    expect(result.startedAt.toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(result.completedAt.toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });

  it('passes distinct inventoryItemReference and reservationReference to provisioning', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope(),
      stack.inboundAdapter,
    );

    expect(result.status).toBe('processed');
    const request = stack.fakeProviderAdapter.getInvocations()[0];
    expect(request).toBeDefined();
    expect(request!.inventoryItemReference).toBe(createInventoryItemReference(PRODUCT_REFERENCE));
    expect(request!.reservationReference).toBeDefined();
    expect(request!.inventoryItemReference).not.toBe(request!.reservationReference);
    expect(request!.quantity).toBe(1);
  });
});

describe('Sprint 18 revision — provisioning quantity and release cleanup', () => {
  it('does not invoke provisioning when reserve output quantity is invalid', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService({ repository, clock, factoryPrefix: 'rev' });
    const adapter = new QuantityInventoryReservationAdapter(service);
    const testProviderRuntime = createTestProviderRuntimeStack({ clock });
    const notificationAdapter = new InMemoryCustomerNotificationAdapter();
    const registry = createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: adapter,
      reservationLifecyclePort: adapter,
      providerRuntimePort: testProviderRuntime.providerRuntime,
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
        reservationReference: 'res-invalid-qty',
        inventoryItemReference: ITEM_REF,
      },
    });

    const context = createPipelineStepExecutionContext({
      executionId: createIdentifier('PipelineExecution', 'exec-2'),
      workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-2'),
      runId: 'run-qty-test',
      input: {
        eventId: 'evt-2',
        eventType: 'order.paid',
        externalOrderReference: 'order-2',
        customerReference: 'cust-2',
        productReference: ITEM_REF,
        quantity: 99,
      },
      metadata: { executionRunId: OWNER },
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
    expect(testProviderRuntime.fakeAdapter.getInvocationCount()).toBe(0);
  });

  it.each([
    ['reservation-not-found', { kind: 'reservation-not-found' as const }],
    [
      'reservation-already-terminal-consumed',
      {
        kind: 'reservation-already-terminal' as const,
        reservationReference: 'res-cleanup',
        ownerReference: OWNER,
        inventoryItemReference: ITEM_REF,
        quantity: 1,
        status: 'consumed' as const,
        reasonCode: 'invalid-transition',
      },
    ],
    [
      'partial-processing',
      {
        kind: 'partial-processing' as const,
        reasonCode: 'reservation-release-failed',
        reservationReference: 'res-cleanup',
      },
    ],
    [
      'repository-failed',
      { kind: 'repository-failed' as const, reasonCode: 'transition-exception' },
    ],
    [
      'invalid-reservation-reference',
      { kind: 'invalid-reservation-reference' as const, reasonCode: 'empty-reference' },
    ],
  ])(
    'treats unsuccessful release outcome %s as partial cleanup failure',
    async (_label, releaseOutcome) => {
      const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
      const repository = new InMemoryInventoryReservationRepository();
      await seedInventory(repository);
      const service = createService({ repository, clock, factoryPrefix: 'rev' });
      const testProviderRuntime = createTestProviderRuntimeStack({ clock });
      testProviderRuntime.fakeAdapter.setMode('rejected');
      const adapter = new QuantityInventoryReservationAdapter(service);
      const lifecycleAdapter = {
        releaseReservation: async () => releaseOutcome as ReleaseReservationOutcome,
        consumeReservation: adapter.consumeReservation.bind(adapter),
      };
      const notificationAdapter = new InMemoryCustomerNotificationAdapter();
      const registry = createDigitalFulfillmentStepRegistry({
        inventoryReservationPort: adapter,
        reservationLifecyclePort: lifecycleAdapter,
        providerRuntimePort: testProviderRuntime.providerRuntime,
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
          reservationReference: 'res-cleanup',
          inventoryItemReference: ITEM_REF,
          quantity: 1,
          status: 'reserved',
        },
      });

      const context = createPipelineStepExecutionContext({
        executionId: createIdentifier('PipelineExecution', 'exec-3'),
        workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-3'),
        runId: 'run-cleanup',
        input: {
          eventId: 'evt-3',
          eventType: 'order.paid',
          externalOrderReference: 'order-3',
          customerReference: 'cust-3',
          productReference: ITEM_REF,
          quantity: 1,
        },
        metadata: { executionRunId: OWNER },
        priorStepOutputs: [reserveOutput],
      });

      const result = await registry.execute(context, {
        id: createIdentifier('PipelineStep', 'step-provision'),
        name: 'Provision Digital Product',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        order: 2,
      });

      expect(result.status).toBe('failed');
      expect(result.output?.failureCode).toBe('partial-processing');
      expect(result.output?.reservationReleased).toBe(false);
      expect(notificationAdapter.getSentNotifications()).toHaveLength(0);
    },
  );
});
