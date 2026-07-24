import { Result } from '../shared/result.js';

export type ReservedQuantity = number & { readonly __brand: 'ReservedQuantity' };

export type ReservedQuantityValidationError = {
  readonly reasonCode:
    | 'non-number-quantity'
    | 'non-integer-quantity'
    | 'non-positive-quantity'
    | 'unsafe-integer-quantity'
    | 'non-finite-quantity';
};

export const parseReservedQuantity = (
  value: unknown,
): Result<ReservedQuantity, ReservedQuantityValidationError> => {
  if (typeof value !== 'number') {
    return Result.fail({ reasonCode: 'non-number-quantity' });
  }

  if (!Number.isFinite(value)) {
    return Result.fail({ reasonCode: 'non-finite-quantity' });
  }

  if (!Number.isInteger(value)) {
    return Result.fail({ reasonCode: 'non-integer-quantity' });
  }

  if (value <= 0) {
    return Result.fail({ reasonCode: 'non-positive-quantity' });
  }

  if (!Number.isSafeInteger(value)) {
    return Result.fail({ reasonCode: 'unsafe-integer-quantity' });
  }

  return Result.ok(value as ReservedQuantity);
};
