import { Result } from '../shared/result.js';

export const PROVIDER_CAPABILITIES = ['digital-subscription-provisioning'] as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export type ProviderCapabilityValidationError = {
  readonly reasonCode: 'invalid-provider-capability';
};

export const parseProviderCapability = (
  value: unknown,
): Result<ProviderCapability, ProviderCapabilityValidationError> => {
  if (typeof value !== 'string') {
    return Result.fail({ reasonCode: 'invalid-provider-capability' });
  }

  if ((PROVIDER_CAPABILITIES as readonly string[]).includes(value)) {
    return Result.ok(value as ProviderCapability);
  }

  return Result.fail({ reasonCode: 'invalid-provider-capability' });
};

export const deduplicateCapabilities = (
  capabilities: readonly ProviderCapability[],
): readonly ProviderCapability[] => [...new Set(capabilities)];
