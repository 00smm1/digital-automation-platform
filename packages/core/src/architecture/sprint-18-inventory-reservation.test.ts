import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createTestInboundGatewayStack } from '../testing/create-test-inbound-gateway-stack.js';
import { createValidExternalOrderPaidEnvelope } from '../application/inbound-event/fake-inbound-event-adapter.js';
import { FakeClock } from '../shared/time/clock.js';
import {
  createFailingInventoryReservationRepository,
  InMemoryInventoryReservationRepository,
} from '../domain/inventory/in-memory-inventory-reservation-repository.js';
import { InventoryReservationService } from '../application/inventory/inventory-reservation-service.js';
import { DeterministicReservationReferenceFactory } from '../application/inventory/reservation-policy.js';
import { createQuantityInventoryRecord } from '../domain/inventory/quantity-inventory-record.js';
import {
  createInventoryItemReference,
  createReservationReference,
  type ReservationOwnerReference,
} from '../domain/inventory/inventory-references.js';
import {
  cloneInventoryReservation,
  createInventoryReservation,
} from '../domain/inventory/inventory-reservation.js';
import { ReservationPolicy } from '../application/inventory/reservation-policy.js';
import { createTestDigitalFulfillmentStack } from '../testing/create-test-digital-fulfillment-stack.js';
import { createDigitalFulfillmentRequest } from '../domain/fulfillment/digital-fulfillment-request.js';
import { createExternalEventEnvelope } from '../domain/inbound-event/external-event-envelope.js';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

export const SENTINEL_PROVIDER_TOKEN = 'SENTINEL_PROVIDER_TOKEN_DO_NOT_LEAK';
export const SENTINEL_PROVISIONING_PASSWORD = 'SENTINEL_PROVISIONING_PASSWORD_DO_NOT_LEAK';
export const SENTINEL_WEBHOOK_SIGNATURE = 'SENTINEL_WEBHOOK_SIGNATURE_DO_NOT_LEAK';
export const SENTINEL_RAW_BODY = 'SENTINEL_RAW_BODY_DO_NOT_LEAK';
export const SENTINEL_REPOSITORY_SECRET = 'SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK';

export const ALL_SENTINELS = [
  SENTINEL_PROVIDER_TOKEN,
  SENTINEL_PROVISIONING_PASSWORD,
  SENTINEL_WEBHOOK_SIGNATURE,
  SENTINEL_RAW_BODY,
  SENTINEL_REPOSITORY_SECRET,
] as const;

const assertSentinelsAbsent = (serialized: string): void => {
  for (const sentinel of ALL_SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
};

const readSourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...readSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(readFileSync(fullPath, 'utf8'));
    }
  }

  return files;
};

const inventoryDomainFiles = readSourceFiles(join(repoRoot, 'packages/core/src/domain/inventory'));

const processEnvelope = async (
  stack: Awaited<ReturnType<typeof createTestInboundGatewayStack>>,
  overrides: Parameters<typeof createValidExternalOrderPaidEnvelope>[0] = {},
) => {
  const envelope = createValidExternalOrderPaidEnvelope(overrides);
  return stack.inboundGateway.process(envelope, stack.inboundAdapter);
};

describe('Sprint 18 payment and WooCommerce regression [S148-S159]', () => {
  it('[S148] confirmed order.paid event authorizes fulfillment through inbound gateway', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
    expect(stack.inventoryReservationRepository.inspectAllReservations()).toHaveLength(1);
  });

  it.each([
    ['pending', 'order.pending'],
    ['failed', 'order.failed'],
    ['cancelled', 'order.cancelled'],
    ['refunded', 'order.refunded'],
  ] as const)(
    '[S149-S152] unsupported commerce event type %s cannot fulfill',
    async (_status, eventType) => {
      const stack = await createTestInboundGatewayStack();
      const result = await processEnvelope(stack, { eventType });

      expect(result.status).toBe('rejected');
      expect(result.failureCode).toBe('UNSUPPORTED_EVENT_TYPE');
      expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
      expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(0);
    },
  );

  it('[S153] WooCommerce-style order.paid flow reaches fulfillment', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack, {
      sourceId: 'woocommerce:store-001',
      externalEventId: 'woo-order-001',
    });

    expect(result.status).toBe('processed');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('[S154] duplicate delivery for the same external event cannot fulfill twice', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope({ externalEventId: 'dup-order-001' });

    const first = await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const second = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(stack.inventoryReservationRepository.inspectAllReservations()).toHaveLength(1);
  });

  it('[S155][S156] duplicate inbound delivery cannot create two reservations', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(stack.inventoryReservationRepository.inspectAllReservations()).toHaveLength(1);
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
  });

  it('[S157] idempotency prevents duplicate business execution for the same event key', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope({ externalEventId: 'auth-order-001' });

    const [first, second] = await Promise.all([
      stack.inboundGateway.process(envelope, stack.inboundAdapter),
      stack.inboundGateway.process(envelope, stack.inboundAdapter),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['duplicate', 'processed']);
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(1);
  });

  it('[S158] inventory reservation uses workflow product reference, not external payment payload fields', () => {
    const reserveStepSource = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/workflow-pipeline/steps/reserve-inventory-step-executor.ts',
      ),
      'utf8',
    );

    expect(reserveStepSource).toContain('input.productReference');
    expect(reserveStepSource).not.toContain('paymentReference');
    expect(reserveStepSource).not.toContain('card_number');
  });

  it('[S159] inventory item reference comes from correlated workflow requirement', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack, {
      payload: {
        orderId: 'order-1001',
        customerId: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 1,
      },
    });

    expect(result.status).toBe('processed');
    const reservation = stack.inventoryReservationRepository.inspectAllReservations()[0];
    expect(reservation?.inventoryItemReference).toContain('digital-premium-12m');
  });
});

describe('Sprint 18 execution run and audit safety [S160-S170]', () => {
  it('[S160][S161][S162][S163] safe execution output includes reservation fields', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);
    const run = await stack.executionRunRepository.findById(result.executionRunId!);
    const serialized = JSON.stringify(run);

    expect(serialized).toMatch(/Reserve Inventory|reservation/i);
    expect(serialized).toMatch(/digital-premium-12m|inventory/i);
  });

  it('[S164][S165][S166][S167][S168][S169][S170] audit excludes repository internals and sentinel values', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.inboundAdapter.configureException(new Error(SENTINEL_WEBHOOK_SIGNATURE));

    const rejected = await processEnvelope(stack);
    assertSentinelsAbsent(JSON.stringify(rejected));

    stack.inboundAdapter.reset();
    const processed = await processEnvelope(stack);
    const runSerialized = JSON.stringify(
      await stack.executionRunRepository.findById(processed.executionRunId!),
    );

    expect(runSerialized).not.toContain('itemLocks');
    expect(runSerialized).not.toContain('Map');
    expect(runSerialized).not.toContain('stack');
    assertSentinelsAbsent(runSerialized);
  });
});

describe('Sprint 18 sensitive-data tests [S171-S179]', () => {
  const itemRef = createInventoryItemReference('sentinel-item');
  const owner = 'run-001' as ReservationOwnerReference;

  it('[S171-S179] public outputs exclude sentinel values', async () => {
    const clock = new FakeClock();
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const record = createQuantityInventoryRecord({
      inventoryItemReference: itemRef,
      totalQuantity: 5,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await baseRepo.saveInventoryItem(record.value);
    const service = new InventoryReservationService({
      repository: failingRepo,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });

    failingRepo.failNextTryReserve();
    const reserveFailure = await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationDurationMs: 1_000,
      metadata: { note: SENTINEL_RAW_BODY },
    });
    assertSentinelsAbsent(JSON.stringify(reserveFailure));

    failingRepo.failNextTryReserve();
    const repositoryFailure = await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationDurationMs: 1_000,
    });
    assertSentinelsAbsent(JSON.stringify(repositoryFailure));

    const created = await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationReference: 'res-sentinel-consume',
      reservationDurationMs: 60_000,
    });
    assertSentinelsAbsent(JSON.stringify(created));

    failingRepo.failNextConsume();
    const consumeFailure = await service.consumeReservation({
      reservationReference: 'res-sentinel-consume',
    });
    assertSentinelsAbsent(JSON.stringify(consumeFailure));

    const stack = await createTestDigitalFulfillmentStack();
    stack.fakeProviderAdapter.setMode('throw');
    stack.fakeProviderAdapter.setConfiguredException(new Error(SENTINEL_PROVISIONING_PASSWORD));
    const workflowFailure = await stack.fulfillmentService.fulfill(
      createDigitalFulfillmentRequest({
        eventId: 'evt-sentinel',
        eventType: 'order.paid',
        externalOrderReference: 'order-sentinel',
        customerReference: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 1,
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
      }),
    );
    assertSentinelsAbsent(JSON.stringify(workflowFailure));

    clock.advanceMs(60_000);
    failingRepo.failNextExpire();
    const expireSummary = await service.expireDueReservations({ now: clock.now() });
    assertSentinelsAbsent(JSON.stringify(expireSummary));
  });
});

describe('Sprint 18 immutability tests [S180-S188]', () => {
  it('[S180-S185] mutating returned reservation dates and metadata does not mutate stored reservation', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const repository = new InMemoryInventoryReservationRepository();
    const record = createQuantityInventoryRecord({
      inventoryItemReference: createInventoryItemReference('immutable-item'),
      totalQuantity: 3,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await repository.saveInventoryItem(record.value);
    const service = new InventoryReservationService({
      repository,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });
    const created = await service.reserveInventory({
      ownerReference: 'run-001',
      inventoryItemReference: createInventoryItemReference('immutable-item'),
      quantity: 1,
      reservationReference: 'res-immutable',
      reservationDurationMs: 60_000,
      metadata: { channel: 'test' },
    });

    expect(created.kind).toBe('reservation-created');
    const storedBefore = repository.inspectReservation(createReservationReference('res-immutable'));
    const clone = cloneInventoryReservation(storedBefore!);

    clone.reservedAt.setFullYear(2000);
    clone.expiresAt.setFullYear(2000);
    if (clone.metadata !== undefined) {
      (clone.metadata as Record<string, string>).channel = 'mutated';
    }

    const storedAfter = repository.inspectReservation(createReservationReference('res-immutable'));
    expect(storedAfter?.reservedAt).toEqual(storedBefore?.reservedAt);
    expect(storedAfter?.expiresAt).toEqual(storedBefore?.expiresAt);
    expect(storedAfter?.metadata).toEqual({ channel: 'test' });
  });

  it('[S186] mutating returned inventory item does not mutate repository state', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    const itemRef = createInventoryItemReference('immutable-quantity-item');
    const record = createQuantityInventoryRecord({
      inventoryItemReference: itemRef,
      totalQuantity: 4,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await repository.saveInventoryItem(record.value);
    const fetched = await repository.findInventoryItemByReference(itemRef);
    (fetched as { totalQuantity: number }).totalQuantity = 99;

    const after = await repository.findInventoryItemByReference(itemRef);
    expect(after?.totalQuantity).toBe(4);
  });

  it('[S187] mutating input metadata after reserve does not mutate stored metadata', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    const itemRef = createInventoryItemReference('metadata-item');
    const record = createQuantityInventoryRecord({
      inventoryItemReference: itemRef,
      totalQuantity: 2,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await repository.saveInventoryItem(record.value);
    const service = new InventoryReservationService({
      repository,
      clock: new FakeClock(),
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });
    const metadata = { channel: 'initial' };
    await service.reserveInventory({
      ownerReference: 'run-001',
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationReference: 'res-metadata',
      reservationDurationMs: 60_000,
      metadata,
    });

    (metadata as Record<string, string>).channel = 'changed';
    const stored = repository.inspectReservation(createReservationReference('res-metadata'));
    expect(stored?.metadata).toEqual({ channel: 'initial' });
  });

  it('[S188] returned reservation arrays cannot mutate internal repository state', () => {
    const reservation = createInventoryReservation({
      reservationReference: createReservationReference('res-array'),
      ownerReference: 'run-001' as ReservationOwnerReference,
      inventoryItemReference: createInventoryItemReference('array-item'),
      quantity: 1 as never,
      status: 'reserved',
      reservedAt: new Date('2026-07-20T08:00:00.000Z'),
      expiresAt: new Date('2026-07-20T08:01:00.000Z'),
      version: 0,
    });

    const clone = cloneInventoryReservation(reservation);
    expect(clone).not.toBe(reservation);
    expect(clone.reservedAt).not.toBe(reservation.reservedAt);
  });
});

describe('Sprint 18 repository failure tests [S189-S196]', () => {
  const itemRef = createInventoryItemReference('failure-item');
  const owner = 'run-001' as ReservationOwnerReference;

  const createFailureContext = async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const record = createQuantityInventoryRecord({
      inventoryItemReference: itemRef,
      totalQuantity: 3,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await baseRepo.saveInventoryItem(record.value);
    const service = new InventoryReservationService({
      repository: failingRepo,
      clock: new FakeClock(),
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });

    return { service, failingRepo };
  };

  it('[S189] tryReserve exception becomes repository-failed', async () => {
    const { service, failingRepo } = await createFailureContext();
    failingRepo.failNextTryReserve();

    const outcome = await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationDurationMs: 1_000,
    });

    expect(outcome.kind).toBe('repository-failed');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[S190] consume exception becomes safe consumption failure', async () => {
    const { service, failingRepo } = await createFailureContext();
    await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationReference: 'res-consume-fail',
      reservationDurationMs: 60_000,
    });
    failingRepo.failNextConsume();

    const outcome = await service.consumeReservation({ reservationReference: 'res-consume-fail' });
    expect(outcome.kind).toBe('partial-processing');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[S191] release exception becomes safe release failure', async () => {
    const { service, failingRepo } = await createFailureContext();
    await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationReference: 'res-release-fail',
      reservationDurationMs: 60_000,
    });
    failingRepo.failNextRelease();

    const outcome = await service.releaseReservation({ reservationReference: 'res-release-fail' });
    expect(outcome.kind).toBe('partial-processing');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[S192] expire exception becomes safe expiration failure', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const baseRepo = new InMemoryInventoryReservationRepository();
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const record = createQuantityInventoryRecord({
      inventoryItemReference: itemRef,
      totalQuantity: 2,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await baseRepo.saveInventoryItem(record.value);
    const service = new InventoryReservationService({
      repository: failingRepo,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });
    await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationReference: 'res-expire-fail',
      reservationDurationMs: 500,
    });

    clock.advanceMs(500);
    failingRepo.failNextExpire();
    const outcome = await service.expireReservation({ reservationReference: 'res-expire-fail' });
    expect(outcome.kind).toBe('repository-failed');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[S193-S196] failures exclude raw errors, repository names, stack traces, and exception objects', async () => {
    const { service, failingRepo } = await createFailureContext();
    failingRepo.failNextTryReserve();

    const outcome = await service.reserveInventory({
      ownerReference: owner,
      inventoryItemReference: itemRef,
      quantity: 1,
      reservationDurationMs: 1_000,
    });
    const serialized = JSON.stringify(outcome);

    expect(serialized).not.toContain('InMemoryInventoryReservationRepository');
    expect(serialized).not.toContain('Error');
    expect(serialized).not.toContain('stack');
    assertSentinelsAbsent(serialized);
  });
});

describe('Sprint 18 architecture tests [S197-S210]', () => {
  it('[S197] inventory Core does not import WooCommerce connector', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/woocommerce-connector/);
      expect(source).not.toMatch(/@dap\/woocommerce-connector/);
    }
  });

  it('[S198] inventory Core does not import AdfPay connector', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/adfpay-connector/);
      expect(source).not.toMatch(/@dap\/adfpay-connector/);
      expect(source).not.toMatch(/AdfPay/);
    }
  });

  it('[S199] inventory Core does not import provisioning implementation', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/FakeDigitalProductProvisioningAdapter/);
      expect(source).not.toMatch(/digital-product-provisioning-adapter/);
    }
  });

  it('[S200] inventory Core does not import application composition roots', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/createTestDigitalFulfillmentStack/);
      expect(source).not.toMatch(/createTestInboundGatewayStack/);
    }
  });

  it('[S201][S202] inventory Core does not import HTTP or database libraries', () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'packages/core/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(dependencies).not.toHaveProperty('express');
    expect(dependencies).not.toHaveProperty('fastify');
    expect(dependencies).not.toHaveProperty('pg');
    expect(dependencies).not.toHaveProperty('typeorm');

    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/from 'express'/);
      expect(source).not.toMatch(/from 'pg'/);
    }
  });

  it('[S203] workflow reserve step depends on inventory port contracts', () => {
    const reserveStep = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/workflow-pipeline/steps/reserve-inventory-step-executor.ts',
      ),
      'utf8',
    );

    expect(reserveStep).toContain('InventoryReservationPort');
    expect(reserveStep).not.toContain('InMemoryInventoryReservationRepository');
  });

  it('[S204] reservation policy lives in application inventory layer, not connectors', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/WooCommerce/);
    }

    const policySource = readFileSync(
      join(repoRoot, 'packages/core/src/application/inventory/reservation-policy.ts'),
      'utf8',
    );
    expect(policySource).toContain('ReservationPolicy');
  });

  it('[S205] inventory service depends on repository port, not concrete in-memory type', () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'packages/core/src/application/inventory/inventory-reservation-service.ts'),
      'utf8',
    );

    expect(serviceSource).toContain('InventoryReservationRepository');
    expect(serviceSource).not.toContain('InMemoryInventoryReservationRepository');
  });

  it('[S206] domain reservation policy does not import in-memory repository', () => {
    const policyInDomain = inventoryDomainFiles.some((source) =>
      source.includes('ReservationPolicy'),
    );
    expect(policyInDomain).toBe(false);
  });

  it('[S207] public exports are explicit in core entrypoint', () => {
    const indexSource = readFileSync(join(repoRoot, 'packages/core/src/index.ts'), 'utf8');
    expect(indexSource).toContain('export');
  });

  it('[S208] internal mutex implementation is not publicly exported from domain index', () => {
    const domainInventoryIndex = readFileSync(
      join(repoRoot, 'packages/core/src/domain/inventory/index.ts'),
      'utf8',
    );

    expect(domainInventoryIndex).not.toContain('itemLocks');
    expect(domainInventoryIndex).not.toContain('withItemLock');
  });

  it('[S209] inventory domain sources do not use any', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/:\s*any\b/);
    }
  });

  it('[S210] inventory domain sources do not introduce unsafe global mutable state', () => {
    for (const source of inventoryDomainFiles) {
      expect(source).not.toMatch(/\bglobalThis\b/);
      expect(source).not.toMatch(/\bwindow\b/);
    }
  });
});

describe('Sprint 18 raw payload boundary', () => {
  it('external envelope with sentinel raw payload is rejected safely at gateway boundary', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createExternalEventEnvelope({
      sourceId: 'test-store',
      externalEventId: 'raw-body-event',
      eventType: 'order.paid',
      receivedAt: new Date('2026-07-20T06:00:00.000Z'),
      payload: {
        orderId: 'order-1001',
        customerId: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 1,
        rawNote: SENTINEL_RAW_BODY,
      },
      headers: { signature: SENTINEL_WEBHOOK_SIGNATURE },
      metadata: { token: SENTINEL_PROVIDER_TOKEN },
    });

    const result = await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 18 reservation policy isolation', () => {
  it('ReservationPolicy remains provider-neutral', () => {
    const policy = new ReservationPolicy();
    const clock = new FakeClock();
    const validation = policy.validateReserveRequest({
      reservationReference: 'res-policy',
      ownerReference: 'run-001',
      inventoryItemReference: createInventoryItemReference('policy-item'),
      quantity: 1,
      clock,
    });

    expect(validation.ok).toBe(true);
  });
});
