import { Result } from '../shared/result.js';

export type ProviderPriority = number & { readonly __brand: 'ProviderPriority' };

export type ProviderPriorityValidationError = {
  readonly reasonCode:
    | 'non-number-priority'
    | 'non-integer-priority'
    | 'negative-priority'
    | 'unsafe-integer-priority'
    | 'non-finite-priority';
};

export const parseProviderPriority = (
  value: unknown,
): Result<ProviderPriority, ProviderPriorityValidationError> => {
  if (typeof value !== 'number') {
    return Result.fail({ reasonCode: 'non-number-priority' });
  }

  if (!Number.isFinite(value)) {
    return Result.fail({ reasonCode: 'non-finite-priority' });
  }

  if (!Number.isInteger(value)) {
    return Result.fail({ reasonCode: 'non-integer-priority' });
  }

  if (value < 0) {
    return Result.fail({ reasonCode: 'negative-priority' });
  }

  if (!Number.isSafeInteger(value)) {
    return Result.fail({ reasonCode: 'unsafe-integer-priority' });
  }

  return Result.ok(value as ProviderPriority);
};

export const compareProviderPriority = (left: ProviderPriority, right: ProviderPriority): number =>
  left - right;
