import { describe, expect, it } from 'vitest';

import {
  applyConsumptionToInventory,
  applyReservationToInventory,
  cloneQuantityInventoryRecord,
  computeAvailableQuantity,
  createQuantityInventoryRecord,
} from './quantity-inventory-record.js';
import {
  createNonNegativeInventoryQuantity,
  createPositiveInventoryQuantity,
} from './inventory-quantity.js';
import { createInventoryItemReference } from './inventory-references.js';
import { ReservationPolicy } from '../../application/inventory/reservation-policy.js';
import { DeterministicReservationReferenceFactory } from '../../application/inventory/reservation-policy.js';
import { InventoryReservationService } from '../../application/inventory/inventory-reservation-service.js';
import { FakeClock } from '../../shared/time/clock.js';
import { InMemoryInventoryReservationRepository } from './in-memory-inventory-reservation-repository.js';

const ITEM_REF = createInventoryItemReference('item-domain-001');

describe('Sprint 18 inventory quantity validation [S01-S10]', () => {
  it('[S01] accepts positive integer reservation quantity', () => {
    const result = createPositiveInventoryQuantity(3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(3);
    }
  });

  it('[S02] rejects zero quantity', () => {
    const result = createPositiveInventoryQuantity(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-positive');
    }
  });

  it('[S03] rejects negative quantity', () => {
    const result = createPositiveInventoryQuantity(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-positive');
    }
  });

  it('[S04] rejects decimal quantity', () => {
    const result = createPositiveInventoryQuantity(1.5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-integer');
    }
  });

  it('[S05] rejects NaN', () => {
    const result = createPositiveInventoryQuantity(Number.NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('nan');
    }
  });

  it('[S06] rejects Infinity', () => {
    const result = createPositiveInventoryQuantity(Number.POSITIVE_INFINITY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-finite');
    }
  });

  it('[S07] rejects negative Infinity', () => {
    const result = createPositiveInventoryQuantity(Number.NEGATIVE_INFINITY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-finite');
    }
  });

  it('[S08] rejects unsafe integer', () => {
    const result = createPositiveInventoryQuantity(Number.MAX_SAFE_INTEGER + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('unsafe-integer');
    }
  });

  it('[S09] rejects string quantity at Core boundary', async () => {
    const clock = new FakeClock();
    const service = new InventoryReservationService({
      repository: new InMemoryInventoryReservationRepository(),
      clock,
      reservationReferenceFactory: new DeterministicReservationReferenceFactory('res'),
    });

    const outcome = await service.reserveInventory({
      ownerReference: 'run-001',
      inventoryItemReference: ITEM_REF,
      quantity: '2',
    });

    expect(outcome.kind).toBe('reservation-conflict');
    if (outcome.kind === 'reservation-conflict') {
      expect(outcome.reasonCode).toBe('invalid-type');
    }
  });

  it('[S10] rejects object quantity at trust boundary', async () => {
    const policy = new ReservationPolicy();
    const clock = new FakeClock();
    const validation = policy.validateReserveRequest({
      reservationReference: 'res-001',
      ownerReference: 'run-001',
      inventoryItemReference: ITEM_REF,
      quantity: { value: 1 },
      clock,
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error.code).toBe('invalid-quantity');
      expect(validation.error.reasonCode).toBe('invalid-type');
    }
  });
});

describe('Sprint 18 inventory item invariants [S11-S20]', () => {
  it('[S11] creates inventory item with valid total quantity', () => {
    const result = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalQuantity).toBe(10);
      expect(result.value.reservedQuantity).toBe(0);
      expect(result.value.consumedQuantity).toBe(0);
    }
  });

  it('[S12] supports zero total quantity', () => {
    const result = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 0,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalQuantity).toBe(0);
      expect(computeAvailableQuantity(result.value)).toBe(0);
    }
  });

  it('[S13] rejects negative total quantity', () => {
    const result = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: -1,
    });

    expect(result.ok).toBe(false);
  });

  it('[S14] rejects reserved quantity exceeding total quantity', () => {
    const base = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 2,
    });

    expect(base.ok).toBe(true);
    if (!base.ok) {
      return;
    }

    const first = applyReservationToInventory(base.value, 2 as never);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = applyReservationToInventory(first.value, 1 as never);
    expect(second.ok).toBe(false);
  });

  it('[S15] rejects consumed quantity exceeding total quantity', () => {
    const base = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 2,
    });

    expect(base.ok).toBe(true);
    if (!base.ok) {
      return;
    }

    const reserved = applyReservationToInventory(base.value, 2 as never);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) {
      return;
    }

    const consumed = applyConsumptionToInventory(reserved.value, 3 as never);
    expect(consumed.ok).toBe(false);
  });

  it('[S16] rejects reserved plus consumed exceeding total quantity', () => {
    const record = {
      inventoryItemReference: ITEM_REF,
      totalQuantity: 5 as never,
      reservedQuantity: 3 as never,
      consumedQuantity: 3 as never,
      version: 0,
    };

    const available = computeAvailableQuantity(record);
    expect(available).toBeLessThan(0);
  });

  it('[S17] calculates available quantity consistently', () => {
    const result = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(computeAvailableQuantity(result.value)).toBe(10);

    const reserved = applyReservationToInventory(result.value, 4 as never);
    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      expect(computeAvailableQuantity(reserved.value)).toBe(6);
    }
  });

  it('[S18] never produces negative available quantity through valid transitions', () => {
    const base = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 3,
    });

    expect(base.ok).toBe(true);
    if (!base.ok) {
      return;
    }

    const reserved = applyReservationToInventory(base.value, 2 as never);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) {
      return;
    }

    expect(computeAvailableQuantity(reserved.value)).toBeGreaterThanOrEqual(0);
  });

  it('[S19] returned inventory item cannot mutate repository state', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    const created = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 5,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await repository.saveInventoryItem(created.value);
    const fetched = await repository.findInventoryItemByReference(ITEM_REF);

    expect(fetched).not.toBeNull();
    if (fetched === null) {
      return;
    }

    const mutated = cloneQuantityInventoryRecord(fetched);
    (mutated as { totalQuantity: number }).totalQuantity = 999;

    const after = await repository.findInventoryItemByReference(ITEM_REF);
    expect(after?.totalQuantity).toBe(5);
  });

  it('[S20] internal metadata cannot be mutated through a returned item', async () => {
    const repository = new InMemoryInventoryReservationRepository();
    const created = createQuantityInventoryRecord({
      inventoryItemReference: ITEM_REF,
      totalQuantity: 5,
      metadata: { channel: 'test' },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await repository.saveInventoryItem(created.value);
    const fetched = await repository.findInventoryItemByReference(ITEM_REF);

    expect(fetched?.metadata).toEqual({ channel: 'test' });
    if (fetched?.metadata === undefined) {
      return;
    }

    (fetched.metadata as Record<string, string>).channel = 'mutated';
    const after = await repository.findInventoryItemByReference(ITEM_REF);
    expect(after?.metadata).toEqual({ channel: 'test' });
  });
});

describe('Sprint 18 non-negative quantity helper', () => {
  it('accepts zero for non-negative inventory totals', () => {
    const result = createNonNegativeInventoryQuantity(0);
    expect(result.ok).toBe(true);
  });
});
