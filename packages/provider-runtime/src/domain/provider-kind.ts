import { Result } from '../shared/result.js';

export const PROVIDER_KINDS = ['digital-provisioning-provider'] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type ProviderKindValidationError = {
  readonly reasonCode: 'invalid-provider-kind';
};

export const parseProviderKind = (
  value: unknown,
): Result<ProviderKind, ProviderKindValidationError> => {
  if (typeof value !== 'string') {
    return Result.fail({ reasonCode: 'invalid-provider-kind' });
  }

  if ((PROVIDER_KINDS as readonly string[]).includes(value)) {
    return Result.ok(value as ProviderKind);
  }

  return Result.fail({ reasonCode: 'invalid-provider-kind' });
};
