import {
  deduplicateCapabilities,
  parseProviderCapability,
  type ProviderCapability,
} from './provider-capability.js';
import { parseProviderHealth, type ProviderHealth } from './provider-health.js';
import { parseProviderKind, type ProviderKind } from './provider-kind.js';
import { parseProviderPriority, type ProviderPriority } from './provider-priority.js';
import {
  parseCredentialReference,
  parseProviderReference,
  type CredentialReference,
  type ProviderReference,
} from './provider-references.js';
import { parseProviderStatus, type ProviderStatus } from './provider-status.js';
import { cloneSafeMetadata, createSafeMetadata, type SafeMetadata } from './safe-metadata.js';
import { Result } from '../shared/result.js';

export type ProviderDescriptor = {
  readonly providerReference: ProviderReference;
  readonly providerKind: ProviderKind;
  readonly supportedCapabilities: readonly ProviderCapability[];
  readonly status: ProviderStatus;
  readonly health: ProviderHealth;
  readonly priority: ProviderPriority;
  readonly credentialReference: CredentialReference;
  readonly metadata?: SafeMetadata;
};

export type ProviderDescriptorInput = {
  readonly providerReference: unknown;
  readonly providerKind: unknown;
  readonly supportedCapabilities: readonly unknown[];
  readonly status: unknown;
  readonly health: unknown;
  readonly priority: unknown;
  readonly credentialReference: unknown;
  readonly metadata?: Readonly<Record<string, string>>;
};

export type ProviderDescriptorValidationError = {
  readonly reasonCode:
    | 'invalid-provider-reference'
    | 'invalid-provider-kind'
    | 'empty-capabilities'
    | 'invalid-capability'
    | 'invalid-provider-status'
    | 'invalid-provider-health'
    | 'invalid-provider-priority'
    | 'invalid-credential-reference';
};

export const createProviderDescriptor = (
  input: ProviderDescriptorInput,
): Result<ProviderDescriptor, ProviderDescriptorValidationError> => {
  const providerReferenceResult = parseProviderReference(input.providerReference);
  if (!providerReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-reference' });
  }

  const providerKindResult = parseProviderKind(input.providerKind);
  if (!providerKindResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-kind' });
  }

  if (input.supportedCapabilities.length === 0) {
    return Result.fail({ reasonCode: 'empty-capabilities' });
  }

  const capabilities: ProviderCapability[] = [];
  for (const capability of input.supportedCapabilities) {
    const capabilityResult = parseProviderCapability(capability);
    if (!capabilityResult.ok) {
      return Result.fail({ reasonCode: 'invalid-capability' });
    }
    capabilities.push(capabilityResult.value);
  }

  const statusResult = parseProviderStatus(input.status);
  if (!statusResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-status' });
  }

  const healthResult = parseProviderHealth(input.health);
  if (!healthResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-health' });
  }

  const priorityResult = parseProviderPriority(input.priority);
  if (!priorityResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-priority' });
  }

  const credentialReferenceResult = parseCredentialReference(input.credentialReference);
  if (!credentialReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-credential-reference' });
  }

  return Result.ok({
    providerReference: providerReferenceResult.value,
    providerKind: providerKindResult.value,
    supportedCapabilities: deduplicateCapabilities(capabilities),
    status: statusResult.value,
    health: healthResult.value,
    priority: priorityResult.value,
    credentialReference: credentialReferenceResult.value,
    metadata: createSafeMetadata(input.metadata),
  });
};

export const cloneProviderDescriptor = (descriptor: ProviderDescriptor): ProviderDescriptor => ({
  providerReference: descriptor.providerReference,
  providerKind: descriptor.providerKind,
  supportedCapabilities: [...descriptor.supportedCapabilities],
  status: descriptor.status,
  health: descriptor.health,
  priority: descriptor.priority,
  credentialReference: descriptor.credentialReference,
  metadata: cloneSafeMetadata(descriptor.metadata),
});
