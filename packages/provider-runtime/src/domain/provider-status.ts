import { Result } from '../shared/result.js';

export const PROVIDER_STATUSES = ['active', 'disabled', 'maintenance'] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export type ProviderStatusValidationError = {
  readonly reasonCode: 'invalid-provider-status';
};

export const parseProviderStatus = (
  value: unknown,
): Result<ProviderStatus, ProviderStatusValidationError> => {
  if (typeof value !== 'string') {
    return Result.fail({ reasonCode: 'invalid-provider-status' });
  }

  if ((PROVIDER_STATUSES as readonly string[]).includes(value)) {
    return Result.ok(value as ProviderStatus);
  }

  return Result.fail({ reasonCode: 'invalid-provider-status' });
};

export const isProviderStatusEligible = (status: ProviderStatus): boolean => status === 'active';
