import { cloneProviderDescriptor, type ProviderDescriptor } from '../domain/provider-descriptor.js';
import {
  compareProviderHealthPreference,
  isProviderHealthEligible,
  PROVIDER_HEALTH_PREFERENCE_ORDER,
} from '../domain/provider-health.js';
import { compareProviderPriority } from '../domain/provider-priority.js';
import { isProviderStatusEligible } from '../domain/provider-status.js';
import type { ProviderReference } from '../domain/provider-references.js';
import type { ProviderSelectionDecision } from './provider-selection-decision.js';
import type { ProviderSelectionRequest } from './provider-selection-request.js';

const supportsCapability = (
  descriptor: ProviderDescriptor,
  requiredCapability: ProviderSelectionRequest['requiredCapability'],
): boolean => descriptor.supportedCapabilities.includes(requiredCapability);

const matchesProviderKind = (
  descriptor: ProviderDescriptor,
  providerKind: ProviderSelectionRequest['providerKind'],
): boolean => providerKind === undefined || descriptor.providerKind === providerKind;

const matchesPermittedReferences = (
  descriptor: ProviderDescriptor,
  permittedProviderReferences: ProviderSelectionRequest['permittedProviderReferences'],
): boolean =>
  permittedProviderReferences === undefined ||
  permittedProviderReferences.some(
    (reference) => String(reference) === String(descriptor.providerReference),
  );

const matchesExcludedReferences = (
  descriptor: ProviderDescriptor,
  excludedProviderReferences: ProviderSelectionRequest['excludedProviderReferences'],
): boolean =>
  excludedProviderReferences === undefined ||
  !excludedProviderReferences.some(
    (reference) => String(reference) === String(descriptor.providerReference),
  );

const compareProviderReferenceLexicographic = (
  left: ProviderReference,
  right: ProviderReference,
): number => String(left).localeCompare(String(right));

const sortCandidates = (candidates: readonly ProviderDescriptor[]): ProviderDescriptor[] =>
  [...candidates].sort((left, right) => {
    const priorityComparison = compareProviderPriority(left.priority, right.priority);
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return compareProviderReferenceLexicographic(left.providerReference, right.providerReference);
  });

const selectBestHealthGroup = (
  candidates: readonly ProviderDescriptor[],
): ProviderDescriptor[] | undefined => {
  for (const preferredHealth of PROVIDER_HEALTH_PREFERENCE_ORDER) {
    const group = candidates.filter((candidate) => candidate.health === preferredHealth);
    if (group.length > 0) {
      return sortCandidates(group);
    }
  }

  return undefined;
};

export class ProviderSelectionPolicy {
  select(params: {
    readonly request: ProviderSelectionRequest;
    readonly descriptors: readonly ProviderDescriptor[];
  }): ProviderSelectionDecision {
    const capabilityMatches = params.descriptors.filter((descriptor) =>
      supportsCapability(descriptor, params.request.requiredCapability),
    );

    if (capabilityMatches.length === 0) {
      return {
        kind: 'no-provider-supports-capability',
        safeCode: 'NO_PROVIDER_SUPPORTS_CAPABILITY',
      };
    }

    const kindMatches = capabilityMatches.filter((descriptor) =>
      matchesProviderKind(descriptor, params.request.providerKind),
    );

    const permittedMatches = kindMatches.filter((descriptor) =>
      matchesPermittedReferences(descriptor, params.request.permittedProviderReferences),
    );

    const unconstrainedMatches = permittedMatches.filter((descriptor) =>
      matchesExcludedReferences(descriptor, params.request.excludedProviderReferences),
    );

    const activeMatches = unconstrainedMatches.filter((descriptor) =>
      isProviderStatusEligible(descriptor.status),
    );

    if (activeMatches.length === 0) {
      const hasDisabledOrMaintenanceOnly = unconstrainedMatches.some(
        (descriptor) => !isProviderStatusEligible(descriptor.status),
      );

      if (hasDisabledOrMaintenanceOnly) {
        return { kind: 'no-active-provider', safeCode: 'NO_ACTIVE_PROVIDER' };
      }

      return {
        kind: 'no-provider-supports-capability',
        safeCode: 'NO_PROVIDER_SUPPORTS_CAPABILITY',
      };
    }

    const healthEligible = activeMatches.filter((descriptor) =>
      isProviderHealthEligible(descriptor.health),
    );

    if (healthEligible.length === 0) {
      return { kind: 'no-eligible-provider-health', safeCode: 'NO_ELIGIBLE_PROVIDER_HEALTH' };
    }

    const selectedGroup = selectBestHealthGroup(healthEligible);
    if (selectedGroup === undefined || selectedGroup.length === 0) {
      return { kind: 'no-eligible-provider-health', safeCode: 'NO_ELIGIBLE_PROVIDER_HEALTH' };
    }

    const selected = selectedGroup[0];
    if (selected === undefined) {
      return { kind: 'provider-selection-conflict', safeCode: 'PROVIDER_SELECTION_CONFLICT' };
    }

    return {
      kind: 'provider-selected',
      descriptor: cloneProviderDescriptor(selected),
      selectionReasonCode: 'SELECTED_BY_POLICY',
      evaluatedCandidateCount: healthEligible.length,
    };
  }
}

export const compareProviderHealthForTests = compareProviderHealthPreference;
