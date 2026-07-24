import { Result } from '../../shared/types/result.js';
import { InvalidInventoryQuantityError } from './errors/reservation-errors.js';

export type InventoryQuantity = number & { readonly __brand: 'InventoryQuantity' };

export type InventoryQuantityValidationMode = 'positive' | 'non-negative';

const validateNumericQuantity = (
  value: unknown,
  mode: InventoryQuantityValidationMode,
): Result<InventoryQuantity, InvalidInventoryQuantityError> => {
  if (typeof value !== 'number') {
    return Result.fail(new InvalidInventoryQuantityError('invalid-type'));
  }

  if (Number.isNaN(value)) {
    return Result.fail(new InvalidInventoryQuantityError('nan'));
  }

  if (!Number.isFinite(value)) {
    return Result.fail(new InvalidInventoryQuantityError('non-finite'));
  }

  if (!Number.isInteger(value)) {
    return Result.fail(new InvalidInventoryQuantityError('non-integer'));
  }

  if (!Number.isSafeInteger(value)) {
    return Result.fail(new InvalidInventoryQuantityError('unsafe-integer'));
  }

  if (mode === 'positive' && value <= 0) {
    return Result.fail(new InvalidInventoryQuantityError('non-positive'));
  }

  if (mode === 'non-negative' && value < 0) {
    return Result.fail(new InvalidInventoryQuantityError('negative'));
  }

  return Result.ok(value as InventoryQuantity);
};

export const createPositiveInventoryQuantity = (
  value: unknown,
): Result<InventoryQuantity, InvalidInventoryQuantityError> =>
  validateNumericQuantity(value, 'positive');

export const createNonNegativeInventoryQuantity = (
  value: unknown,
): Result<InventoryQuantity, InvalidInventoryQuantityError> =>
  validateNumericQuantity(value, 'non-negative');

export const assertInventoryQuantity = (value: InventoryQuantity): number => value;
