import { Result } from '../shared/result.js';

export const PROVIDER_HEALTH_STATES = ['healthy', 'degraded', 'unhealthy', 'unknown'] as const;

export type ProviderHealth = (typeof PROVIDER_HEALTH_STATES)[number];

export type ProviderHealthValidationError = {
  readonly reasonCode: 'invalid-provider-health';
};

export const parseProviderHealth = (
  value: unknown,
): Result<ProviderHealth, ProviderHealthValidationError> => {
  if (typeof value !== 'string') {
    return Result.fail({ reasonCode: 'invalid-provider-health' });
  }

  if ((PROVIDER_HEALTH_STATES as readonly string[]).includes(value)) {
    return Result.ok(value as ProviderHealth);
  }

  return Result.fail({ reasonCode: 'invalid-provider-health' });
};

export const PROVIDER_HEALTH_PREFERENCE_ORDER: readonly ProviderHealth[] = [
  'healthy',
  'degraded',
  'unknown',
];

export const isProviderHealthEligible = (health: ProviderHealth): boolean => health !== 'unhealthy';

export const compareProviderHealthPreference = (
  left: ProviderHealth,
  right: ProviderHealth,
): number =>
  PROVIDER_HEALTH_PREFERENCE_ORDER.indexOf(left) - PROVIDER_HEALTH_PREFERENCE_ORDER.indexOf(right);
