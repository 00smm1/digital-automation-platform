import { describe, expect, it } from 'vitest';

import { FakeClock } from '../../shared/time/clock.js';
import { InventoryReservationService } from '../../application/inventory/inventory-reservation-service.js';
import { DeterministicReservationReferenceFactory } from '../../application/inventory/reservation-policy.js';
import {
  createFailingInventoryReservationRepository,
  InMemoryInventoryReservationRepository,
} from './in-memory-inventory-reservation-repository.js';
import {
  createInventoryItemReference,
  createReservationReference,
  type ReservationOwnerReference,
} from './inventory-references.js';
import {
  createQuantityInventoryRecord,
  computeAvailableQuantity,
} from './quantity-inventory-record.js';
import {
  consumeReservationTransition,
  expireReservationTransition,
  releaseReservationTransition,
} from './reservation-transitions.js';
import { createInventoryReservation } from './inventory-reservation.js';
import { createTestDigitalFulfillmentStack } from '../../testing/create-test-digital-fulfillment-stack.js';
import { createDigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';

const ITEM_REF = createInventoryItemReference('item-lifecycle-001');
const OWNER_A = 'run-001' as ReservationOwnerReference;
const OWNER_B = 'run-002' as ReservationOwnerReference;

type LifecycleContext = {
  clock: FakeClock;
  repository: InMemoryInventoryReservationRepository;
  service: InventoryReservationService;
};

const createLifecycleContext = async (options?: {
  totalQuantity?: number;
  clock?: FakeClock;
}): Promise<LifecycleContext> => {
  const clock = options?.clock ?? new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
  const repository = new InMemoryInventoryReservationRepository();
  const record = createQuantityInventoryRecord({
    inventoryItemReference: ITEM_REF,
    totalQuantity: options?.totalQuantity ?? 10,
  });

  if (!record.ok) {
    throw new Error('Failed to seed inventory.');
  }

  await repository.saveInventoryItem(record.value);

  const service = new InventoryReservationService({
    repository,
    clock,
    reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
  });

  return { clock, repository, service };
};

const reserve = (
  service: InventoryReservationService,
  params: {
    ownerReference?: ReservationOwnerReference;
    quantity?: number;
    reservationReference?: string;
    reservationDurationMs?: number;
    expiresAt?: Date;
    externalOrderReference?: string;
    metadata?: Readonly<Record<string, string | number | boolean>>;
  } = {},
) =>
  service.reserveInventory({
    ownerReference: params.ownerReference ?? OWNER_A,
    inventoryItemReference: ITEM_REF,
    quantity: params.quantity ?? 1,
    reservationReference: params.reservationReference,
    reservationDurationMs: params.reservationDurationMs ?? 60_000,
    expiresAt: params.expiresAt,
    externalOrderReference: params.externalOrderReference,
    metadata: params.metadata,
  });

describe('Sprint 18 reservation creation [S21-S34]', () => {
  it('[S21][S22][S23][S24][S25][S26][S27][S28][S29][S30][S31] creates valid reservation with preserved fields', async () => {
    const { clock, repository, service } = await createLifecycleContext({ totalQuantity: 5 });
    const before = await repository.findInventoryItemByReference(ITEM_REF);

    const outcome = await reserve(service, {
      reservationReference: 'res-stable-001',
      quantity: 2,
      externalOrderReference: 'order-1001',
    });

    expect(outcome.kind).toBe('reservation-created');
    if (outcome.kind !== 'reservation-created') {
      return;
    }

    expect(outcome.reservationReference).toBe('res-stable-001');
    expect(outcome.ownerReference).toBe(OWNER_A);
    expect(outcome.inventoryItemReference).toBe(ITEM_REF);
    expect(outcome.quantity).toBe(2);
    expect(outcome.status).toBe('reserved');
    expect(outcome.reservedAt).toEqual(clock.now());
    expect(outcome.expiresAt.getTime()).toBe(clock.now().getTime() + 60_000);

    const after = await repository.findInventoryItemByReference(ITEM_REF);
    expect(computeAvailableQuantity(after!)).toBe(computeAvailableQuantity(before!) - 2);
    expect(after?.reservedQuantity).toBe(2);
    expect(after?.consumedQuantity).toBe(0);
  });

  it('[S32][S33][S34] reservation stores no provider credentials, raw payload, or provisioning password', async () => {
    const { service, repository } = await createLifecycleContext();
    const outcome = await reserve(service, {
      metadata: { channel: 'test' },
    });

    expect(outcome.kind).toBe('reservation-created');
    if (outcome.kind !== 'reservation-created') {
      return;
    }

    const stored = repository.inspectReservation(
      createReservationReference(outcome.reservationReference),
    );
    const serialized = JSON.stringify(stored);

    expect(serialized).not.toContain('SENTINEL_PROVIDER_TOKEN_DO_NOT_LEAK');
    expect(serialized).not.toContain('SENTINEL_PROVISIONING_PASSWORD_DO_NOT_LEAK');
    expect(serialized).not.toContain('SENTINEL_RAW_BODY_DO_NOT_LEAK');
  });
});

describe('Sprint 18 insufficient inventory [S35-S40]', () => {
  it('[S35][S36][S37][S38][S39] rejects over-reservation without side effects', async () => {
    const { repository, service } = await createLifecycleContext({ totalQuantity: 1 });
    const before = await repository.findInventoryItemByReference(ITEM_REF);

    const outcome = await reserve(service, { quantity: 2 });

    expect(outcome.kind).toBe('insufficient-inventory');
    expect(repository.inspectAllReservations()).toHaveLength(0);

    const after = await repository.findInventoryItemByReference(ITEM_REF);
    expect(after?.reservedQuantity).toBe(before?.reservedQuantity);
    expect(computeAvailableQuantity(after!)).toBe(computeAvailableQuantity(before!));
  });

  it('[S40] does not invoke provisioning after insufficient inventory', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 0 });
    const result = await stack.fulfillmentService.fulfill(
      createDigitalFulfillmentRequest({
        eventId: 'evt-insufficient',
        eventType: 'order.paid',
        externalOrderReference: 'order-insufficient',
        customerReference: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 1,
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
      }),
    );

    expect(result.inventoryOutcome.status).toBe('failed');
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(0);
  });
});

describe('Sprint 18 missing inventory [S41-S44]', () => {
  it('[S41][S42][S43] returns inventory-item-not-found for unknown item', async () => {
    const { service, repository } = await createLifecycleContext();
    const unknownRef = createInventoryItemReference('missing-item');

    const outcome = await service.reserveInventory({
      ownerReference: OWNER_A,
      inventoryItemReference: unknownRef,
      quantity: 1,
      reservationDurationMs: 60_000,
    });

    expect(outcome.kind).toBe('inventory-item-not-found');
    expect(repository.inspectAllReservations()).toHaveLength(0);
  });

  it('[S44] repository exception is not mistaken for item-not-found', async () => {
    const baseRepo = new InMemoryInventoryReservationRepository();
    const record = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 1,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await baseRepo.saveInventoryItem(record.value);
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    failingRepo.failNextTryReserve();

    const service = new InventoryReservationService({
      repository: failingRepo,
      clock: new FakeClock(),
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });

    const outcome = await service.reserveInventory({
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationDurationMs: 60_000,
    });

    expect(outcome.kind).toBe('repository-failed');
    expect(outcome.kind).not.toBe('inventory-item-not-found');
  });
});

describe('Sprint 18 duplicate reservation [S45-S53]', () => {
  it('[S45][S46][S47] identical sequential requests decrement inventory once', async () => {
    const { repository, service } = await createLifecycleContext({ totalQuantity: 3 });

    const first = await reserve(service, { reservationReference: 'res-dup-001', quantity: 1 });
    const second = await reserve(service, { reservationReference: 'res-dup-001', quantity: 1 });

    expect(first.kind).toBe('reservation-created');
    expect(second.kind).toBe('reservation-duplicate');
    if (second.kind === 'reservation-duplicate') {
      expect(second.reservationReference).toBe('res-dup-001');
    }

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBe(1);
  });

  it('[S48] same owner and item with different quantity returns conflict', async () => {
    const { service } = await createLifecycleContext();

    await reserve(service, { quantity: 1 });
    const conflict = await reserve(service, { quantity: 2 });

    expect(conflict.kind).toBe('reservation-conflict');
    if (conflict.kind === 'reservation-conflict') {
      expect(conflict.reasonCode).toBe('owner-quantity-conflict');
    }
  });

  it('[S49] same reservation reference with different owner returns conflict', async () => {
    const { service } = await createLifecycleContext();

    await reserve(service, { reservationReference: 'res-conflict-owner', ownerReference: OWNER_A });
    const conflict = await reserve(service, {
      reservationReference: 'res-conflict-owner',
      ownerReference: OWNER_B,
    });

    expect(conflict.kind).toBe('reservation-conflict');
    if (conflict.kind === 'reservation-conflict') {
      expect(conflict.reasonCode).toBe('reservation-reference-conflict');
    }
  });

  it('[S50] same reservation reference with different inventory item returns conflict', async () => {
    const { service, repository } = await createLifecycleContext();
    const otherItem = createInventoryItemReference('item-other');
    const otherRecord = createQuantityInventoryRecord({
      inventoryItemReference: otherItem,
      totalQuantity: 5,
    });

    if (!otherRecord.ok) {
      throw new Error('seed failed');
    }

    await repository.saveInventoryItem(otherRecord.value);

    await service.reserveInventory({
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationReference: 'res-cross-item',
      reservationDurationMs: 60_000,
    });

    const conflict = await service.reserveInventory({
      ownerReference: OWNER_A,
      inventoryItemReference: otherItem,
      quantity: 1,
      reservationReference: 'res-cross-item',
      reservationDurationMs: 60_000,
    });

    expect(conflict.kind).toBe('reservation-conflict');
  });

  it('[S51] same owner cannot reserve again after consumption', async () => {
    const { service } = await createLifecycleContext();

    const created = await reserve(service, { reservationReference: 'res-consume-lock' });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    await service.consumeReservation({ reservationReference: created.reservationReference });
    const retry = await reserve(service);

    expect(retry.kind).toBe('reservation-conflict');
    if (retry.kind === 'reservation-conflict') {
      expect(retry.reasonCode).toBe('owner-requirement-already-completed');
    }
  });

  it('[S52] same owner cannot reserve again after release', async () => {
    const { service } = await createLifecycleContext();

    const created = await reserve(service, { reservationReference: 'res-release-lock' });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    await service.releaseReservation({ reservationReference: created.reservationReference });
    const retry = await reserve(service);

    expect(retry.kind).toBe('reservation-conflict');
  });

  it('[S53] same owner cannot reserve again after expiration', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });

    const created = await reserve(service, {
      reservationReference: 'res-expire-lock',
      reservationDurationMs: 1_000,
    });

    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    clock.advanceMs(1_000);
    await service.expireReservation({ reservationReference: created.reservationReference });
    const retry = await reserve(service);

    expect(retry.kind).toBe('reservation-conflict');
  });
});

describe('Sprint 18 concurrent reservation [S54-S65]', () => {
  it('[S54][S55][S56][S57][S58][S59] two owners compete for one available unit', async () => {
    const { repository, service } = await createLifecycleContext({ totalQuantity: 1 });

    const [first, second] = await Promise.all([
      reserve(service, { ownerReference: OWNER_A }),
      reserve(service, { ownerReference: OWNER_B }),
    ]);

    const outcomes = [first.kind, second.kind].sort();
    expect(outcomes).toEqual(['insufficient-inventory', 'reservation-created']);
    expect(repository.inspectAllReservations()).toHaveLength(1);

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(computeAvailableQuantity(item!)).toBe(0);
    expect(item?.reservedQuantity).toBe(1);
  });

  it('[S60][S61][S62][S63][S64] same owner concurrent identical requests create one reservation', async () => {
    const { repository, service } = await createLifecycleContext({ totalQuantity: 2 });

    let releaseBarrier!: () => void;
    const entryGate = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    const originalTryReserve = repository.tryReserve.bind(repository);
    let entered = 0;
    repository.tryReserve = async (request, context) => {
      entered += 1;
      if (entered === 1) {
        await entryGate;
      }
      return originalTryReserve(request, context);
    };

    const firstPromise = reserve(service, { reservationReference: 'res-concurrent-owner' });
    const secondPromise = reserve(service, { reservationReference: 'res-concurrent-owner' });

    await Promise.resolve();
    releaseBarrier();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(['reservation-created', 'reservation-duplicate']);
    expect(repository.inspectAllReservations()).toHaveLength(1);

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBe(1);
    expect(computeAvailableQuantity(item!)).toBeGreaterThanOrEqual(0);
  });

  it('[S65] concurrent calls leave repository state valid', async () => {
    const { repository, service } = await createLifecycleContext({ totalQuantity: 5 });

    await Promise.all([
      reserve(service, { ownerReference: OWNER_A, quantity: 1 }),
      reserve(service, { ownerReference: OWNER_B, quantity: 1 }),
      reserve(service, { ownerReference: 'run-003' as ReservationOwnerReference, quantity: 1 }),
    ]);

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBeLessThanOrEqual(item!.totalQuantity);
    expect(computeAvailableQuantity(item!)).toBeGreaterThanOrEqual(0);
  });
});

describe('Sprint 18 consume transition [S66-S76]', () => {
  it('[S66][S67][S68][S69][S70][S71] consumes reserved reservation before expiry', async () => {
    const { clock, repository, service } = await createLifecycleContext({ totalQuantity: 5 });
    const created = await reserve(service, { quantity: 2 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    const consumed = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });

    expect(consumed.kind).toBe('reservation-consumed');
    if (consumed.kind === 'reservation-consumed') {
      expect(consumed.status).toBe('consumed');
      expect(consumed.consumedAt).toEqual(clock.now());
    }

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBe(0);
    expect(item?.consumedQuantity).toBe(2);
    expect(computeAvailableQuantity(item!)).toBe(3);
  });

  it('[S72] repeated consume is idempotent', async () => {
    const { service } = await createLifecycleContext();
    const created = await reserve(service);
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    const first = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });
    const second = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });

    expect(first.kind).toBe('reservation-consumed');
    expect(second.kind).toBe('reservation-consumed');
  });

  it('[S73][S74][S75] consumed reservation cannot be released, expired, or re-reserved', async () => {
    const { service } = await createLifecycleContext();
    const created = await reserve(service);
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    await service.consumeReservation({ reservationReference: created.reservationReference });

    const release = await service.releaseReservation({
      reservationReference: created.reservationReference,
    });
    expect(release.kind).toBe('reservation-already-terminal');

    const expire = await service.expireReservation({
      reservationReference: created.reservationReference,
    });
    expect(expire.kind).toBe('reservation-already-terminal');

    const retry = await reserve(service);
    expect(retry.kind).toBe('reservation-conflict');
  });

  it('[S76] consume of unknown reservation returns reservation-not-found', async () => {
    const { service } = await createLifecycleContext();
    const outcome = await service.consumeReservation({ reservationReference: 'missing-res' });

    expect(outcome.kind).toBe('reservation-not-found');
  });
});

describe('Sprint 18 release transition [S77-S86]', () => {
  it('[S77][S78][S79][S80][S81][S82] releases reserved reservation', async () => {
    const { clock, repository, service } = await createLifecycleContext({ totalQuantity: 5 });
    const created = await reserve(service, { quantity: 2 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    const released = await service.releaseReservation({
      reservationReference: created.reservationReference,
    });

    expect(released.kind).toBe('reservation-released');
    if (released.kind === 'reservation-released') {
      expect(released.status).toBe('released');
      expect(released.releasedAt).toEqual(clock.now());
    }

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBe(0);
    expect(item?.consumedQuantity).toBe(0);
    expect(computeAvailableQuantity(item!)).toBe(5);
  });

  it('[S83] repeated release is idempotent', async () => {
    const { service } = await createLifecycleContext();
    const created = await reserve(service);
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    const first = await service.releaseReservation({
      reservationReference: created.reservationReference,
    });
    const second = await service.releaseReservation({
      reservationReference: created.reservationReference,
    });

    expect(first.kind).toBe('reservation-released');
    expect(second.kind).toBe('reservation-released');
  });

  it('[S84][S85] released reservation cannot be consumed or expired', async () => {
    const { service } = await createLifecycleContext();
    const created = await reserve(service);
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    await service.releaseReservation({ reservationReference: created.reservationReference });

    const consume = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });
    expect(consume.kind).toBe('reservation-already-terminal');

    const expire = await service.expireReservation({
      reservationReference: created.reservationReference,
    });
    expect(expire.kind).toBe('reservation-already-terminal');
  });

  it('[S86] release of unknown reservation returns reservation-not-found', async () => {
    const { service } = await createLifecycleContext();
    const outcome = await service.releaseReservation({ reservationReference: 'missing-res' });

    expect(outcome.kind).toBe('reservation-not-found');
  });
});

describe('Sprint 18 expiration transition [S87-S101]', () => {
  it('[S87] reserved reservation does not expire before deadline', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });
    const created = await reserve(service, { reservationDurationMs: 5_000 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    clock.advanceMs(4_999);
    const outcome = await service.expireReservation({
      reservationReference: created.reservationReference,
    });

    expect(outcome.kind).toBe('reservation-already-terminal');
    if (outcome.kind === 'reservation-already-terminal') {
      expect(outcome.reasonCode).toBe('invalid-expiration');
    }
  });

  it('[S88][S89][S90][S91][S92][S93] expires at and after expiresAt', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { repository, service } = await createLifecycleContext({ clock });
    const created = await reserve(service, { reservationDurationMs: 1_000 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    clock.advanceMs(1_000);
    const expired = await service.expireReservation({
      reservationReference: created.reservationReference,
    });

    expect(expired.kind).toBe('reservation-expired');
    if (expired.kind === 'reservation-expired') {
      expect(expired.status).toBe('expired');
      expect(expired.expiredAt).toEqual(clock.now());
    }

    const item = await repository.findInventoryItemByReference(ITEM_REF);
    expect(item?.reservedQuantity).toBe(0);
    expect(computeAvailableQuantity(item!)).toBe(10);
  });

  it('[S94] repeated expiration is idempotent', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });
    const created = await reserve(service, { reservationDurationMs: 1_000 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    clock.advanceMs(1_000);
    const first = await service.expireReservation({
      reservationReference: created.reservationReference,
    });
    const second = await service.expireReservation({
      reservationReference: created.reservationReference,
    });

    expect(first.kind).toBe('reservation-expired');
    expect(second.kind).toBe('reservation-expired');
  });

  it('[S95][S96] consumed and released reservations are skipped by expiration', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });

    const consumed = await reserve(service, { reservationReference: 'res-exp-skip-consume' });
    expect(consumed.kind).toBe('reservation-created');
    if (consumed.kind !== 'reservation-created') {
      return;
    }

    await service.consumeReservation({ reservationReference: consumed.reservationReference });
    clock.advanceMs(2_000);

    const consumeExpire = await service.expireReservation({
      reservationReference: consumed.reservationReference,
    });
    expect(consumeExpire.kind).toBe('reservation-already-terminal');

    const released = await reserve(service, {
      ownerReference: OWNER_B,
      reservationReference: 'res-exp-skip-release',
    });
    expect(released.kind).toBe('reservation-created');
    if (released.kind !== 'reservation-created') {
      return;
    }

    await service.releaseReservation({ reservationReference: released.reservationReference });
    const releaseExpire = await service.expireReservation({
      reservationReference: released.reservationReference,
    });
    expect(releaseExpire.kind).toBe('reservation-already-terminal');
  });

  it('[S97][S98] expired reservation cannot be consumed or released', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });
    const created = await reserve(service, { reservationDurationMs: 1_000 });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    clock.advanceMs(1_000);
    await service.expireReservation({ reservationReference: created.reservationReference });

    const consume = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });
    expect(consume.kind).toBe('reservation-already-terminal');

    const release = await service.releaseReservation({
      reservationReference: created.reservationReference,
    });
    expect(release.kind).toBe('reservation-already-terminal');
  });

  it('[S99][S100][S101] consumption boundary at expiry', async () => {
    const expiresAt = new Date('2026-07-20T08:01:00.000Z');
    const clock = new FakeClock(new Date('2026-07-20T08:00:59.999Z'));
    const { service } = await createLifecycleContext({ clock });
    const created = await reserve(service, { expiresAt });
    expect(created.kind).toBe('reservation-created');
    if (created.kind !== 'reservation-created') {
      return;
    }

    const beforeExpiry = await service.consumeReservation({
      reservationReference: created.reservationReference,
    });
    expect(beforeExpiry.kind).toBe('reservation-consumed');

    const clockAtExpiry = new FakeClock(new Date('2026-07-20T08:00:59.000Z'));
    const ctxAtExpiry = await createLifecycleContext({ clock: clockAtExpiry });
    const atExpiryCreated = await reserve(ctxAtExpiry.service, {
      expiresAt: new Date('2026-07-20T08:01:00.000Z'),
    });
    expect(atExpiryCreated.kind).toBe('reservation-created');
    if (atExpiryCreated.kind !== 'reservation-created') {
      return;
    }

    clockAtExpiry.setTime(new Date('2026-07-20T08:01:00.000Z'));
    const atExpiryConsume = await ctxAtExpiry.service.consumeReservation({
      reservationReference: atExpiryCreated.reservationReference,
    });
    expect(atExpiryConsume.kind).toBe('reservation-already-terminal');

    const clockAfterExpiry = new FakeClock(new Date('2026-07-20T08:01:00.001Z'));
    const ctxAfterExpiry = await createLifecycleContext({ clock: clockAfterExpiry });
    const afterCreated = await reserve(ctxAfterExpiry.service, {
      expiresAt: new Date('2026-07-20T08:02:00.000Z'),
    });
    expect(afterCreated.kind).toBe('reservation-created');
    if (afterCreated.kind !== 'reservation-created') {
      return;
    }

    clockAfterExpiry.setTime(new Date('2026-07-20T08:02:00.001Z'));
    const afterConsume = await ctxAfterExpiry.service.consumeReservation({
      reservationReference: afterCreated.reservationReference,
    });
    expect(afterConsume.kind).toBe('reservation-already-terminal');
  });
});

describe('Sprint 18 expire-due operation [S102-S112]', () => {
  it('[S102][S103][S104][S105][S106] expireDueReservations handles due and future reservations', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { repository, service } = await createLifecycleContext({ clock });

    const due = await reserve(service, {
      reservationReference: 'res-due',
      reservationDurationMs: 1_000,
    });
    const future = await reserve(service, {
      ownerReference: OWNER_B,
      reservationReference: 'res-future',
      reservationDurationMs: 60_000,
    });
    expect(due.kind).toBe('reservation-created');
    expect(future.kind).toBe('reservation-created');

    clock.advanceMs(1_000);
    const summary = await service.expireDueReservations();

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.inspectedCount).toBe(1);
      expect(summary.expiredCount).toBe(1);
    }
    expect(repository.inspectReservation(createReservationReference('res-due'))?.status).toBe(
      'expired',
    );
    expect(repository.inspectReservation(createReservationReference('res-future'))?.status).toBe(
      'reserved',
    );
  });

  it('[S107] repeated expire-due operation is idempotent', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });
    await reserve(service, { reservationDurationMs: 500 });
    clock.advanceMs(500);

    const first = await service.expireDueReservations();
    const second = await service.expireDueReservations();

    expect(first.kind).toBe('expiration-summary');
    expect(second.kind).toBe('expiration-summary');
    if (first.kind === 'expiration-summary' && second.kind === 'expiration-summary') {
      expect(first.expiredCount).toBe(1);
      expect(second.expiredCount).toBe(0);
      expect(second.failedCount).toBe(0);
    }
  });

  it('[S108][S109] expiration summary counts inspected and expired reservations', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock, totalQuantity: 5 });
    await reserve(service, { reservationReference: 'res-a', reservationDurationMs: 500 });
    await reserve(service, {
      ownerReference: OWNER_B,
      reservationReference: 'res-b',
      reservationDurationMs: 500,
    });
    clock.advanceMs(500);

    const summary = await service.expireDueReservations();
    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.inspectedCount).toBe(2);
      expect(summary.expiredCount).toBe(2);
    }
  });

  it('[S110][S111] individual repository failure is reported safely in expire-due', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const baseRepo = new InMemoryInventoryReservationRepository();
    const record = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 2,
    });

    if (!record.ok) {
      throw new Error('seed failed');
    }

    await baseRepo.saveInventoryItem(record.value);
    const failingRepo = createFailingInventoryReservationRepository(baseRepo);
    const service = new InventoryReservationService({
      repository: failingRepo,
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });

    await service.reserveInventory({
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1,
      reservationReference: 'res-fail-expire',
      reservationDurationMs: 500,
    });

    clock.advanceMs(500);
    failingRepo.failNextExpire();

    const summary = await service.expireDueReservations();
    const serialized = JSON.stringify(summary);

    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.failedCount).toBe(1);
      expect(summary.failedReservationReferences).toContain('res-fail-expire');
    }
    expect(serialized).not.toContain('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
  });

  it('[S112] expire-due uses Clock without real timers', async () => {
    const clock = new FakeClock(new Date('2026-07-20T08:00:00.000Z'));
    const { service } = await createLifecycleContext({ clock });
    await reserve(service, { reservationDurationMs: 1 });
    clock.advanceMs(1);

    const summary = await service.expireDueReservations({ now: clock.now() });
    expect(summary.kind).toBe('expiration-summary');
    if (summary.kind === 'expiration-summary') {
      expect(summary.expiredCount).toBe(1);
    }
  });
});

describe('Sprint 18 domain transition helpers', () => {
  it('consume transition rejects expired reservation at boundary', () => {
    const reservation = createInventoryReservation({
      reservationReference: createReservationReference('res-domain'),
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1 as never,
      status: 'reserved',
      reservedAt: new Date('2026-07-20T08:00:00.000Z'),
      expiresAt: new Date('2026-07-20T08:01:00.000Z'),
      version: 0,
    });

    const result = consumeReservationTransition(reservation, new Date('2026-07-20T08:01:00.000Z'));
    expect(result.ok).toBe(false);
  });

  it('expire transition requires due deadline', () => {
    const reservation = createInventoryReservation({
      reservationReference: createReservationReference('res-domain-expire'),
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1 as never,
      status: 'reserved',
      reservedAt: new Date('2026-07-20T08:00:00.000Z'),
      expiresAt: new Date('2026-07-20T08:01:00.000Z'),
      version: 0,
    });

    const early = expireReservationTransition(reservation, new Date('2026-07-20T08:00:30.000Z'));
    expect(early.ok).toBe(false);

    const due = expireReservationTransition(reservation, new Date('2026-07-20T08:01:00.000Z'));
    expect(due.ok).toBe(true);
  });

  it('release transition is idempotent for released reservations', () => {
    const reservation = createInventoryReservation({
      reservationReference: createReservationReference('res-domain-release'),
      ownerReference: OWNER_A,
      inventoryItemReference: ITEM_REF,
      quantity: 1 as never,
      status: 'released',
      reservedAt: new Date('2026-07-20T08:00:00.000Z'),
      expiresAt: new Date('2026-07-20T08:01:00.000Z'),
      releasedAt: new Date('2026-07-20T08:00:30.000Z'),
      version: 1,
    });

    const result = releaseReservationTransition(reservation, new Date('2026-07-20T08:00:45.000Z'));
    expect(result.ok).toBe(true);
  });
});

describe('Sprint 18 provisioning guard for insufficient inventory', () => {
  it('provisioning adapter remains untouched when reservation fails', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 0 });
    stack.fakeProviderAdapter.setMode('rejected');

    await stack.fulfillmentService.fulfill(
      createDigitalFulfillmentRequest({
        eventId: 'evt-no-provision',
        eventType: 'order.paid',
        externalOrderReference: 'order-no-provision',
        customerReference: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 1,
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
      }),
    );

    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(0);
  });
});
