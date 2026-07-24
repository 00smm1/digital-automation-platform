import { parseProviderCapability, type ProviderCapability } from '../domain/provider-capability.js';
import { parseProviderKind, type ProviderKind } from '../domain/provider-kind.js';
import { parseProviderReference, type ProviderReference } from '../domain/provider-references.js';
import { cloneSafeMetadata, type SafeMetadata } from '../domain/safe-metadata.js';
import { Result } from '../shared/result.js';

export type ProviderSelectionRequest = {
  readonly requiredCapability: ProviderCapability;
  readonly permittedProviderReferences?: readonly ProviderReference[];
  readonly excludedProviderReferences?: readonly ProviderReference[];
  readonly providerKind?: ProviderKind;
  readonly routingConstraints?: SafeMetadata;
};

export type ProviderSelectionRequestInput = {
  readonly requiredCapability: unknown;
  readonly permittedProviderReferences?: readonly unknown[];
  readonly excludedProviderReferences?: readonly unknown[];
  readonly providerKind?: unknown;
  readonly routingConstraints?: Readonly<Record<string, string>>;
};

export type ProviderSelectionRequestValidationError = {
  readonly reasonCode:
    | 'invalid-required-capability'
    | 'invalid-permitted-provider-reference'
    | 'invalid-excluded-provider-reference'
    | 'invalid-provider-kind'
    | 'contradictory-provider-constraints';
};

const parseProviderReferenceList = (
  values: readonly unknown[] | undefined,
  errorReason: ProviderSelectionRequestValidationError['reasonCode'],
): Result<readonly ProviderReference[] | undefined, ProviderSelectionRequestValidationError> => {
  if (values === undefined) {
    return Result.ok(undefined);
  }

  const parsed: ProviderReference[] = [];
  for (const value of values) {
    const result = parseProviderReference(value);
    if (!result.ok) {
      return Result.fail({ reasonCode: errorReason });
    }
    parsed.push(result.value);
  }

  return Result.ok([...parsed]);
};

export const createProviderSelectionRequest = (
  input: ProviderSelectionRequestInput,
): Result<ProviderSelectionRequest, ProviderSelectionRequestValidationError> => {
  const capabilityResult = parseProviderCapability(input.requiredCapability);
  if (!capabilityResult.ok) {
    return Result.fail({ reasonCode: 'invalid-required-capability' });
  }

  const permittedResult = parseProviderReferenceList(
    input.permittedProviderReferences,
    'invalid-permitted-provider-reference',
  );
  if (!permittedResult.ok) {
    return Result.fail(permittedResult.error);
  }

  const excludedResult = parseProviderReferenceList(
    input.excludedProviderReferences,
    'invalid-excluded-provider-reference',
  );
  if (!excludedResult.ok) {
    return Result.fail(excludedResult.error);
  }

  let providerKind: ProviderKind | undefined;
  if (input.providerKind !== undefined) {
    const providerKindResult = parseProviderKind(input.providerKind);
    if (!providerKindResult.ok) {
      return Result.fail({ reasonCode: 'invalid-provider-kind' });
    }
    providerKind = providerKindResult.value;
  }

  if (permittedResult.value !== undefined && excludedResult.value !== undefined) {
    const excludedSet = new Set(excludedResult.value.map(String));
    for (const permitted of permittedResult.value) {
      if (excludedSet.has(String(permitted))) {
        return Result.fail({ reasonCode: 'contradictory-provider-constraints' });
      }
    }
  }

  return Result.ok({
    requiredCapability: capabilityResult.value,
    permittedProviderReferences:
      permittedResult.value === undefined ? undefined : [...permittedResult.value],
    excludedProviderReferences:
      excludedResult.value === undefined ? undefined : [...excludedResult.value],
    providerKind,
    routingConstraints: cloneSafeMetadata(input.routingConstraints),
  });
};

export const cloneProviderSelectionRequest = (
  request: ProviderSelectionRequest,
): ProviderSelectionRequest => ({
  requiredCapability: request.requiredCapability,
  permittedProviderReferences:
    request.permittedProviderReferences === undefined
      ? undefined
      : [...request.permittedProviderReferences],
  excludedProviderReferences:
    request.excludedProviderReferences === undefined
      ? undefined
      : [...request.excludedProviderReferences],
  providerKind: request.providerKind,
  routingConstraints:
    request.routingConstraints === undefined ? undefined : { ...request.routingConstraints },
});
