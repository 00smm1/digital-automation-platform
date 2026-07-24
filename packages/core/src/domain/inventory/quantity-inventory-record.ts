import type { InventoryItemReference } from './inventory-references.js';
import {
  createNonNegativeInventoryQuantity,
  type InventoryQuantity,
} from './inventory-quantity.js';
import { InventoryQuantityInvariantError } from './errors/reservation-errors.js';
import { Result } from '../../shared/types/result.js';

export type SafeInventoryMetadata = Readonly<Record<string, string | number | boolean>>;

export type QuantityInventoryRecord = {
  readonly inventoryItemReference: InventoryItemReference;
  readonly totalQuantity: InventoryQuantity;
  readonly reservedQuantity: InventoryQuantity;
  readonly consumedQuantity: InventoryQuantity;
  readonly version: number;
  readonly metadata?: SafeInventoryMetadata;
};

const cloneMetadata = (
  metadata: SafeInventoryMetadata | undefined,
): SafeInventoryMetadata | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  return { ...metadata };
};

export const computeAvailableQuantity = (record: QuantityInventoryRecord): number =>
  record.totalQuantity - record.reservedQuantity - record.consumedQuantity;

export const createQuantityInventoryRecord = (params: {
  readonly inventoryItemReference: InventoryItemReference;
  readonly totalQuantity: unknown;
  readonly metadata?: SafeInventoryMetadata;
}): Result<QuantityInventoryRecord, InventoryQuantityInvariantError> => {
  const totalResult = createNonNegativeInventoryQuantity(params.totalQuantity);

  if (!totalResult.ok) {
    return Result.fail(new InventoryQuantityInvariantError('invalid-total-quantity'));
  }

  const zeroResult = createNonNegativeInventoryQuantity(0);

  if (!zeroResult.ok) {
    return Result.fail(new InventoryQuantityInvariantError('invalid-zero-quantity'));
  }

  return Result.ok({
    inventoryItemReference: params.inventoryItemReference,
    totalQuantity: totalResult.value,
    reservedQuantity: zeroResult.value,
    consumedQuantity: zeroResult.value,
    version: 0,
    metadata: cloneMetadata(params.metadata),
  });
};

export const cloneQuantityInventoryRecord = (
  record: QuantityInventoryRecord,
): QuantityInventoryRecord => ({
  inventoryItemReference: record.inventoryItemReference,
  totalQuantity: record.totalQuantity,
  reservedQuantity: record.reservedQuantity,
  consumedQuantity: record.consumedQuantity,
  version: record.version,
  metadata: cloneMetadata(record.metadata),
});

export const applyReservationToInventory = (
  record: QuantityInventoryRecord,
  quantity: InventoryQuantity,
): Result<QuantityInventoryRecord, InventoryQuantityInvariantError> => {
  const available = computeAvailableQuantity(record);

  if (available < quantity) {
    return Result.fail(new InventoryQuantityInvariantError('insufficient-available-quantity'));
  }

  const nextReserved = record.reservedQuantity + quantity;
  const nextAvailable = record.totalQuantity - nextReserved - record.consumedQuantity;

  if (nextAvailable < 0) {
    return Result.fail(new InventoryQuantityInvariantError('negative-available-quantity'));
  }

  if (nextReserved + record.consumedQuantity > record.totalQuantity) {
    return Result.fail(new InventoryQuantityInvariantError('reserved-plus-consumed-exceeds-total'));
  }

  return Result.ok({
    ...cloneQuantityInventoryRecord(record),
    reservedQuantity: nextReserved as InventoryQuantity,
    version: record.version + 1,
  });
};

export const applyConsumptionToInventory = (
  record: QuantityInventoryRecord,
  quantity: InventoryQuantity,
): Result<QuantityInventoryRecord, InventoryQuantityInvariantError> => {
  if (record.reservedQuantity < quantity) {
    return Result.fail(new InventoryQuantityInvariantError('reserved-quantity-too-low'));
  }

  const nextReserved = record.reservedQuantity - quantity;
  const nextConsumed = record.consumedQuantity + quantity;

  if (nextConsumed > record.totalQuantity) {
    return Result.fail(new InventoryQuantityInvariantError('consumed-exceeds-total'));
  }

  const nextAvailable = record.totalQuantity - nextReserved - nextConsumed;

  if (nextAvailable < 0) {
    return Result.fail(new InventoryQuantityInvariantError('negative-available-quantity'));
  }

  return Result.ok({
    ...cloneQuantityInventoryRecord(record),
    reservedQuantity: nextReserved as InventoryQuantity,
    consumedQuantity: nextConsumed as InventoryQuantity,
    version: record.version + 1,
  });
};

export const applyReleaseToInventory = (
  record: QuantityInventoryRecord,
  quantity: InventoryQuantity,
): Result<QuantityInventoryRecord, InventoryQuantityInvariantError> => {
  if (record.reservedQuantity < quantity) {
    return Result.fail(new InventoryQuantityInvariantError('reserved-quantity-too-low'));
  }

  const nextReserved = record.reservedQuantity - quantity;
  const nextAvailable = record.totalQuantity - nextReserved - record.consumedQuantity;

  if (nextAvailable < 0) {
    return Result.fail(new InventoryQuantityInvariantError('negative-available-quantity'));
  }

  return Result.ok({
    ...cloneQuantityInventoryRecord(record),
    reservedQuantity: nextReserved as InventoryQuantity,
    version: record.version + 1,
  });
};

export const applyExpirationToInventory = (
  record: QuantityInventoryRecord,
  quantity: InventoryQuantity,
): Result<QuantityInventoryRecord, InventoryQuantityInvariantError> =>
  applyReleaseToInventory(record, quantity);
