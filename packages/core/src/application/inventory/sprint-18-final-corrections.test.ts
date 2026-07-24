import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../shared/time/clock.js';
import { InventoryReservationService } from '../inventory/inventory-reservation-service.js';
import { DeterministicReservationReferenceFactory } from '../inventory/reservation-policy.js';
import {
  InMemoryInventoryReservationRepository,
  createFailingInventoryReservationRepository,
} from '../../domain/inventory/in-memory-inventory-reservation-repository.js';
import type {
  InventoryReservationRepository,
  TransitionReservationResult,
} from '../../domain/inventory/inventory-reservation-repository.js';
import {
  createInventoryItemReference,
  createReservationReference,
  type ReservationOwnerReference,
} from '../../domain/inventory/inventory-references.js';
import {
  cloneInventoryReservation,
  createInventoryReservation,
  type InventoryReservation,
} from '../../domain/inventory/inventory-reservation.js';
import { createQuantityInventoryRecord } from '../../domain/inventory/quantity-inventory-record.js';
import { QuantityInventoryReservationAdapter } from '../fulfillment/adapters/quantity-inventory-reservation-adapter.js';
import { InMemoryCustomerNotificationAdapter } from '../fulfillment/adapters/in-memory-customer-notification-adapter.js';
import { createWorkflowTestProviderRuntime } from '../../testing/create-workflow-test-provider-runtime.js';
import type { FakeProviderAdapterMode } from '@dap/provider-runtime';
import { createDigitalFulfillmentStepRegistry } from '../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../fulfillment/fulfillment-pipeline-step-types.js';

const ITEM_REF = createInventoryItemReference('final-correction-item');
const OWNER = 'run-final-001' as ReservationOwnerReference;
const SENTINEL_PROVISIONING_EXCEPTION = 'SENTINEL_PROVISIONING_EXCEPTION_DO_NOT_LEAK';
const SENTINEL_RELEASE_EXCEPTION = 'SENTINEL_RELEASE_EXCEPTION_DO_NOT_LEAK';

const seedInventory = async (repository: InMemoryInventoryReservationRepository): Promise<void> => {
  const record = createQuantityInventoryRecord({
    inventoryItemReference: ITEM_REF,
    totalQuantity: 10,
  });

  if (!record.ok) {
    throw new Error('Failed to seed inventory.');
  }

  await repository.saveInventoryItem(record.value);
};

const createService = (
  repository: InventoryReservationRepository,
  clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z')),
): InventoryReservationService =>
  new InventoryReservationService({
    repository,
    clock,
    reservationReferenceFactory: new DeterministicReservationReferenceFactory('final'),
  });

const createProvisionContext = (clock: FakeClock, reserveReference = 'res-final') =>
  createPipelineStepExecutionContext({
    executionId: createIdentifier('PipelineExecution', 'exec-final'),
    workflowDefinitionId: createIdentifier('WorkflowDefinition', 'wf-final'),
    runId: 'run-final',
    input: {
      eventId: 'evt-final',
      eventType: 'order.paid',
      externalOrderReference: 'order-final',
      customerReference: 'cust-final',
      productReference: ITEM_REF,
      quantity: 1,
    },
    metadata: { executionRunId: OWNER },
    priorStepOutputs: [
      createPipelineStepExecutionResult({
        stepId: createIdentifier('PipelineStep', 'step-reserve'),
        stepName: 'Reserve Inventory',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
        status: 'succeeded',
        startedAt: clock.now(),
        completedAt: clock.now(),
        output: {
          reservationReference: reserveReference,
          inventoryItemReference: ITEM_REF,
          quantity: 1,
          status: 'reserved',
        },
      }),
    ],
  });

const createDueReservation = (params: {
  reference: string;
  status?: InventoryReservation['status'];
  clock: FakeClock;
}): InventoryReservation =>
  createInventoryReservation({
    reservationReference: createReservationReference(params.reference),
    ownerReference: OWNER,
    inventoryItemReference: ITEM_REF,
    quantity: 1,
    status: params.status ?? 'reserved',
    reservedAt: params.clock.now(),
    expiresAt: new Date(params.clock.now().getTime() - 1),
    version: 1,
  });

const createControlledExpireDueRepository = (params: {
  dueReservation: InventoryReservation;
  expireTransitionResult: TransitionReservationResult;
}): InventoryReservationRepository => ({
  saveInventoryItem: async () => undefined,
  findInventoryItemByReference: async () => null,
  findReservationByReference: async (reference) =>
    reference === params.dueReservation.reservationReference
      ? cloneInventoryReservation(params.dueReservation)
      : null,
  findReservationByOwnerKey: async () => null,
  tryReserve: async () => ({ kind: 'inventory-item-not-found' }),
  findReservedReservationsDue: async () => [cloneInventoryReservation(params.dueReservation)],
  transitionReservation: async () => params.expireTransitionResult,
});

describe('Sprint 18 final correction — exactly-once provisioning cleanup', () => {
  const runProvisionStep = async (options: {
    adapterMode: FakeProviderAdapterMode;
    configuredException?: Error;
    releaseReservation: () => Promise<unknown>;
  }) => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    await seedInventory(repository);
    const service = createService(repository, clock);
    const adapter = new QuantityInventoryReservationAdapter(service);
    let releaseCount = 0;
    const providerRuntimeStack = createWorkflowTestProviderRuntime({
      clock,
      adapterMode: options.adapterMode,
      configuredException: options.configuredException,
    });

    const lifecycleAdapter = {
      releaseReservation: async () => {
        releaseCount += 1;
        return options.releaseReservation();
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

    const result = await registry.execute(createProvisionContext(clock), {
      id: createIdentifier('PipelineStep', 'step-provision'),
      name: 'Provision Digital Product',
      stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
      order: 2,
    });

    return {
      result,
      releaseCount,
      notificationAdapter,
      fakeProviderAdapter: providerRuntimeStack.fakeAdapter,
    };
  };

  it('typed provisioning failure invokes release exactly once', async () => {
    const { result, releaseCount } = await runProvisionStep({
      adapterMode: 'rejected',
      releaseReservation: async () => ({
        kind: 'reservation-released',
        reservationReference: 'res-final',
        ownerReference: OWNER,
        inventoryItemReference: ITEM_REF,
        quantity: 1,
        status: 'released',
        releasedAt: new Date(),
      }),
    });

    expect(releaseCount).toBe(1);
    expect(result.output?.reservationReleased).toBe(true);
  });

  it('thrown provisioning failure invokes release exactly once', async () => {
    const { result, releaseCount } = await runProvisionStep({
      adapterMode: 'throw',
      configuredException: new Error(SENTINEL_PROVISIONING_EXCEPTION),
      releaseReservation: async () => ({
        kind: 'reservation-released',
        reservationReference: 'res-final',
        ownerReference: OWNER,
        inventoryItemReference: ITEM_REF,
        quantity: 1,
        status: 'released',
        releasedAt: new Date(),
      }),
    });

    expect(releaseCount).toBe(1);
    expect(result.output?.failureCode).toBe('PROVIDER_EXECUTION_FAILED');
    expect(JSON.stringify(result)).not.toContain(SENTINEL_PROVISIONING_EXCEPTION);
  });

  it('release typed failure after provisioning failure produces partial-processing', async () => {
    const { result, releaseCount } = await runProvisionStep({
      adapterMode: 'rejected',
      releaseReservation: async () => ({ kind: 'reservation-not-found' }),
    });

    expect(releaseCount).toBe(1);
    expect(result.output?.failureCode).toBe('partial-processing');
    expect(result.output?.reservationReleased).toBe(false);
  });

  it('release exception produces partial-processing and does not escape the pipeline', async () => {
    const { result, releaseCount } = await runProvisionStep({
      adapterMode: 'rejected',
      releaseReservation: async () => {
        throw new Error(SENTINEL_RELEASE_EXCEPTION);
      },
    });

    expect(releaseCount).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.output?.failureCode).toBe('partial-processing');
    expect(result.output?.releaseFailureCode).toBe('release-exception');
    expect(result.output?.reservationReleased).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SENTINEL_RELEASE_EXCEPTION);
  });

  it('does not invoke release twice when provisioning failure and release both throw', async () => {
    const { result, releaseCount, notificationAdapter, fakeProviderAdapter } =
      await runProvisionStep({
        adapterMode: 'throw',
        configuredException: new Error(SENTINEL_PROVISIONING_EXCEPTION),
        releaseReservation: async () => {
          throw new Error(SENTINEL_RELEASE_EXCEPTION);
        },
      });

    expect(releaseCount).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.output?.failureCode).toBe('partial-processing');
    expect(notificationAdapter.getSentNotifications()).toHaveLength(0);
    expect(fakeProviderAdapter.getInvocationCount()).toBe(1);
  });
});

describe('Sprint 18 final correction — expire-due terminal accounting', () => {
  it('counts consumed race as skippedTerminalCount, not expiredCount', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const dueReservation = createDueReservation({
      reference: 'res-race-consumed',
      clock,
    });
    const repository = createControlledExpireDueRepository({
      dueReservation,
      expireTransitionResult: {
        kind: 'invalid-transition',
        reasonCode: 'reservation-already-consumed',
        reservation: createInventoryReservation({
          ...dueReservation,
          status: 'consumed',
          consumedAt: clock.now(),
        }),
      },
    });
    const service = createService(repository, clock);

    const summary = await service.expireDueReservations();

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.inspectedCount).toBe(1);
      expect(summary.expiredCount).toBe(0);
      expect(summary.skippedTerminalCount).toBe(1);
      expect(summary.failedCount).toBe(0);
      expect(summary.expiredCount + summary.skippedTerminalCount + summary.failedCount).toBe(
        summary.inspectedCount,
      );
    }
  });

  it('counts released race as skippedTerminalCount, not expiredCount', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const dueReservation = createDueReservation({
      reference: 'res-race-released',
      clock,
    });
    const repository = createControlledExpireDueRepository({
      dueReservation,
      expireTransitionResult: {
        kind: 'invalid-transition',
        reasonCode: 'reservation-already-released',
        reservation: createInventoryReservation({
          ...dueReservation,
          status: 'released',
          releasedAt: clock.now(),
        }),
      },
    });
    const service = createService(repository, clock);

    const summary = await service.expireDueReservations();

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.expiredCount).toBe(0);
      expect(summary.skippedTerminalCount).toBe(1);
      expect(summary.expiredCount + summary.skippedTerminalCount + summary.failedCount).toBe(
        summary.inspectedCount,
      );
    }
  });

  it('counts idempotent already-expired result as expiredCount', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const dueReservation = createDueReservation({
      reference: 'res-race-expired',
      clock,
    });
    const expiredReservation = createInventoryReservation({
      ...dueReservation,
      status: 'expired',
      expiredAt: clock.now(),
    });
    const inventoryRecord = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 10,
    });

    if (!inventoryRecord.ok) {
      throw new Error('Failed to seed inventory record.');
    }

    const repository = createControlledExpireDueRepository({
      dueReservation,
      expireTransitionResult: {
        kind: 'idempotent',
        reservation: expiredReservation,
        inventoryItem: inventoryRecord.value,
      },
    });
    const service = createService(repository, clock);

    const summary = await service.expireDueReservations();

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.expiredCount).toBe(1);
      expect(summary.skippedTerminalCount).toBe(0);
      expect(summary.failedCount).toBe(0);
    }
  });

  it('counts failed expiration in failedCount and keeps summary totals consistent', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const delegate = new InMemoryInventoryReservationRepository();
    await seedInventory(delegate);
    const failingRepo = createFailingInventoryReservationRepository(delegate);
    const service = createService(failingRepo, clock);

    const reserved = await service.reserveInventory({
      ownerReference: OWNER,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationReference: 'res-fail-expire',
      reservationDurationMs: 500,
    });
    expect(reserved.kind).toBe('reservation-created');

    clock.advanceMs(500);
    failingRepo.failNextExpire();

    const summary = await service.expireDueReservations();
    const serialized = JSON.stringify(summary);

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.inspectedCount).toBe(1);
      expect(summary.failedCount).toBe(1);
      expect(summary.expiredCount).toBe(0);
      expect(summary.skippedTerminalCount).toBe(0);
      expect(summary.failedReservationReferences).toContain('res-fail-expire');
      expect(summary.expiredCount + summary.skippedTerminalCount + summary.failedCount).toBe(
        summary.inspectedCount,
      );
    }

    expect(serialized).not.toContain('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
  });
});
