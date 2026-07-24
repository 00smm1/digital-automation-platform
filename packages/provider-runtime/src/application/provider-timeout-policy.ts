import { parseProviderCapability, type ProviderCapability } from '../domain/provider-capability.js';
import { parseProviderReference, type ProviderReference } from '../domain/provider-references.js';
import { Result } from '../shared/result.js';

export type ProviderTimeoutPolicy = {
  readonly defaultTimeoutMilliseconds: number;
  readonly capabilityOverrides?: Readonly<Partial<Record<ProviderCapability, number>>>;
  readonly providerOverrides?: Readonly<Partial<Record<string, number>>>;
};

export type ProviderTimeoutPolicyInput = {
  readonly defaultTimeoutMilliseconds: unknown;
  readonly capabilityOverrides?: Readonly<Partial<Record<string, unknown>>>;
  readonly providerOverrides?: Readonly<Partial<Record<string, unknown>>>;
};

export type ProviderTimeoutPolicyValidationError = {
  readonly reasonCode:
    'invalid-default-timeout' | 'invalid-capability-timeout' | 'invalid-provider-timeout';
};

const parsePositiveTimeout = (
  value: unknown,
  reasonCode: ProviderTimeoutPolicyValidationError['reasonCode'],
): Result<number, ProviderTimeoutPolicyValidationError> => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return Result.fail({ reasonCode });
  }

  if (value <= 0 || !Number.isSafeInteger(value)) {
    return Result.fail({ reasonCode });
  }

  return Result.ok(value);
};

export const createProviderTimeoutPolicy = (
  input: ProviderTimeoutPolicyInput,
): Result<ProviderTimeoutPolicy, ProviderTimeoutPolicyValidationError> => {
  const defaultTimeoutResult = parsePositiveTimeout(
    input.defaultTimeoutMilliseconds,
    'invalid-default-timeout',
  );
  if (!defaultTimeoutResult.ok) {
    return Result.fail(defaultTimeoutResult.error);
  }

  const capabilityOverrides: Partial<Record<ProviderCapability, number>> = {};
  if (input.capabilityOverrides !== undefined) {
    for (const [capabilityKey, timeoutValue] of Object.entries(input.capabilityOverrides)) {
      const capabilityResult = parseProviderCapability(capabilityKey);
      if (!capabilityResult.ok) {
        return Result.fail({ reasonCode: 'invalid-capability-timeout' });
      }

      const timeoutResult = parsePositiveTimeout(timeoutValue, 'invalid-capability-timeout');
      if (!timeoutResult.ok) {
        return Result.fail(timeoutResult.error);
      }

      capabilityOverrides[capabilityResult.value] = timeoutResult.value;
    }
  }

  const providerOverrides: Partial<Record<string, number>> = {};
  if (input.providerOverrides !== undefined) {
    for (const [providerReferenceValue, timeoutValue] of Object.entries(input.providerOverrides)) {
      const providerReferenceResult = parseProviderReference(providerReferenceValue);
      if (!providerReferenceResult.ok) {
        return Result.fail({ reasonCode: 'invalid-provider-timeout' });
      }

      const timeoutResult = parsePositiveTimeout(timeoutValue, 'invalid-provider-timeout');
      if (!timeoutResult.ok) {
        return Result.fail(timeoutResult.error);
      }

      providerOverrides[String(providerReferenceResult.value)] = timeoutResult.value;
    }
  }

  return Result.ok({
    defaultTimeoutMilliseconds: defaultTimeoutResult.value,
    capabilityOverrides:
      Object.keys(capabilityOverrides).length > 0 ? { ...capabilityOverrides } : undefined,
    providerOverrides:
      Object.keys(providerOverrides).length > 0 ? { ...providerOverrides } : undefined,
  });
};

export const resolveProviderTimeoutMilliseconds = (params: {
  readonly policy: ProviderTimeoutPolicy;
  readonly providerReference: ProviderReference;
  readonly capability: ProviderCapability;
}): number => {
  const providerOverride = params.policy.providerOverrides?.[String(params.providerReference)];
  if (providerOverride !== undefined) {
    return providerOverride;
  }

  const capabilityOverride = params.policy.capabilityOverrides?.[params.capability];
  if (capabilityOverride !== undefined) {
    return capabilityOverride;
  }

  return params.policy.defaultTimeoutMilliseconds;
};
