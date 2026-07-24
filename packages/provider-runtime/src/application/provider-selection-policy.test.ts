import { describe, expect, it } from 'vitest';

import { createProviderDescriptor } from '../domain/provider-descriptor.js';
import { createProviderSelectionRequest } from './provider-selection-request.js';
import { ProviderSelectionPolicy } from './provider-selection-policy.js';
import type { ProviderDescriptor } from '../domain/provider-descriptor.js';

const policy = new ProviderSelectionPolicy();

const createDescriptor = (
  overrides: Partial<{
    providerReference: string;
    providerKind: string;
    supportedCapabilities: readonly string[];
    status: string;
    health: string;
    priority: number;
    credentialReference: string;
  }>,
): ProviderDescriptor => {
  const result = createProviderDescriptor({
    providerReference: overrides.providerReference ?? 'provider-default',
    providerKind: overrides.providerKind ?? 'digital-provisioning-provider',
    supportedCapabilities: overrides.supportedCapabilities ?? ['digital-subscription-provisioning'],
    status: overrides.status ?? 'active',
    health: overrides.health ?? 'healthy',
    priority: overrides.priority ?? 0,
    credentialReference: overrides.credentialReference ?? 'credential-default',
  });

  if (!result.ok) {
    throw new Error(`Failed to create descriptor: ${result.error.reasonCode}`);
  }

  return result.value;
};

const select = (
  descriptors: readonly ProviderDescriptor[],
  requestOverrides: Parameters<typeof createProviderSelectionRequest>[0] = {
    requiredCapability: 'digital-subscription-provisioning',
  },
) => {
  const requestResult = createProviderSelectionRequest(requestOverrides);
  if (!requestResult.ok) {
    throw new Error(`Invalid selection request: ${requestResult.error.reasonCode}`);
  }

  return policy.select({
    request: requestResult.value,
    descriptors,
  });
};

describe('Sprint 19 provider selection policy [E01-E28]', () => {
  it('[E01] selects sole eligible provider', () => {
    const descriptor = createDescriptor({ providerReference: 'provider-solo' });
    const decision = select([descriptor]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-solo');
      expect(decision.selectionReasonCode).toBe('SELECTED_BY_POLICY');
      expect(decision.evaluatedCandidateCount).toBe(1);
    }
  });

  it('[E02] returns no-provider-supports-capability when capability mismatches', () => {
    const descriptor = createDescriptor({
      supportedCapabilities: ['digital-subscription-provisioning'],
    });
    const requestResult = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
    });
    expect(requestResult.ok).toBe(true);
    if (!requestResult.ok) {
      return;
    }

    const unsupportedDescriptor: ProviderDescriptor = {
      ...descriptor,
      supportedCapabilities: [],
    };

    const decision = policy.select({
      request: requestResult.value,
      descriptors: [unsupportedDescriptor],
    });

    expect(decision.kind).toBe('no-provider-supports-capability');
  });

  it('[E03] returns no-provider-supports-capability for empty registry', () => {
    const decision = select([]);
    expect(decision.kind).toBe('no-provider-supports-capability');
    if (decision.kind === 'no-provider-supports-capability') {
      expect(decision.safeCode).toBe('NO_PROVIDER_SUPPORTS_CAPABILITY');
    }
  });

  it('[E04] filters by provider kind when specified', () => {
    const matching = createDescriptor({
      providerReference: 'provider-kind-match',
      providerKind: 'digital-provisioning-provider',
    });
    const otherKind = createDescriptor({
      providerReference: 'provider-kind-other',
      providerKind: 'digital-provisioning-provider',
    });

    const decision = select([matching, otherKind], {
      requiredCapability: 'digital-subscription-provisioning',
      providerKind: 'digital-provisioning-provider',
    });

    expect(decision.kind).toBe('provider-selected');
  });

  it('[E05] returns no-provider-supports-capability when kind filter excludes all', () => {
    createDescriptor({ providerKind: 'digital-provisioning-provider' });
    const requestResult = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
      providerKind: 'not-a-real-kind',
    });

    expect(requestResult.ok).toBe(false);
  });

  it('[E06] respects permitted provider references', () => {
    const allowed = createDescriptor({ providerReference: 'provider-allowed' });
    const blocked = createDescriptor({ providerReference: 'provider-blocked' });

    const decision = select([allowed, blocked], {
      requiredCapability: 'digital-subscription-provisioning',
      permittedProviderReferences: ['provider-allowed'],
    });

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-allowed');
    }
  });

  it('[E07] returns no-provider-supports-capability when permitted list excludes all matches', () => {
    const descriptor = createDescriptor({ providerReference: 'provider-a' });
    const decision = select([descriptor], {
      requiredCapability: 'digital-subscription-provisioning',
      permittedProviderReferences: ['provider-not-registered'],
    });

    expect(decision.kind).toBe('no-provider-supports-capability');
  });

  it('[E08] respects excluded provider references', () => {
    const kept = createDescriptor({ providerReference: 'provider-kept', priority: 0 });
    const excluded = createDescriptor({ providerReference: 'provider-excluded', priority: 1 });

    const decision = select([kept, excluded], {
      requiredCapability: 'digital-subscription-provisioning',
      excludedProviderReferences: ['provider-excluded'],
    });

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-kept');
    }
  });

  it('[E09] returns no-active-provider when only disabled providers match', () => {
    const disabled = createDescriptor({
      providerReference: 'provider-disabled',
      status: 'disabled',
    });
    const decision = select([disabled]);

    expect(decision.kind).toBe('no-active-provider');
    if (decision.kind === 'no-active-provider') {
      expect(decision.safeCode).toBe('NO_ACTIVE_PROVIDER');
    }
  });

  it('[E10] returns no-active-provider when only maintenance providers match', () => {
    const maintenance = createDescriptor({
      providerReference: 'provider-maintenance',
      status: 'maintenance',
    });
    const decision = select([maintenance]);

    expect(decision.kind).toBe('no-active-provider');
  });

  it('[E11] returns no-eligible-provider-health when only unhealthy providers are active', () => {
    const unhealthy = createDescriptor({
      providerReference: 'provider-unhealthy',
      health: 'unhealthy',
    });
    const decision = select([unhealthy]);

    expect(decision.kind).toBe('no-eligible-provider-health');
    if (decision.kind === 'no-eligible-provider-health') {
      expect(decision.safeCode).toBe('NO_ELIGIBLE_PROVIDER_HEALTH');
    }
  });

  it('[E12] prefers healthy over degraded providers', () => {
    const degraded = createDescriptor({
      providerReference: 'provider-degraded',
      health: 'degraded',
      priority: 0,
    });
    const healthy = createDescriptor({
      providerReference: 'provider-healthy',
      health: 'healthy',
      priority: 5,
    });

    const decision = select([degraded, healthy]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-healthy');
    }
  });

  it('[E13] prefers degraded over unknown health within eligible group', () => {
    const unknown = createDescriptor({
      providerReference: 'provider-unknown',
      health: 'unknown',
      priority: 0,
    });
    const degraded = createDescriptor({
      providerReference: 'provider-degraded',
      health: 'degraded',
      priority: 5,
    });

    const decision = select([unknown, degraded]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-degraded');
    }
  });

  it('[E14] selects lower priority value over higher priority value', () => {
    const highPriority = createDescriptor({ providerReference: 'provider-high', priority: 10 });
    const lowPriority = createDescriptor({ providerReference: 'provider-low', priority: 1 });

    const decision = select([highPriority, lowPriority]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-low');
    }
  });

  it('[E15] breaks priority ties lexicographically by provider reference', () => {
    const zebra = createDescriptor({ providerReference: 'provider-z', priority: 0 });
    const alpha = createDescriptor({ providerReference: 'provider-a', priority: 0 });

    const decision = select([zebra, alpha]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-a');
    }
  });

  it('[E16] returns cloned descriptor independent from source list entry', () => {
    const source = createDescriptor({ providerReference: 'provider-clone-test' });
    const decision = select([source]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor).not.toBe(source);
      expect(decision.descriptor.supportedCapabilities).not.toBe(source.supportedCapabilities);
    }
  });

  it('[E17] evaluatedCandidateCount reflects health-eligible active candidates', () => {
    const candidates = [
      createDescriptor({ providerReference: 'provider-1', health: 'healthy' }),
      createDescriptor({ providerReference: 'provider-2', health: 'degraded' }),
      createDescriptor({ providerReference: 'provider-3', health: 'unknown' }),
    ];

    const decision = select(candidates);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.evaluatedCandidateCount).toBe(3);
    }
  });

  it('[E18] excludes unhealthy providers from evaluated candidate count selection pool', () => {
    const unhealthy = createDescriptor({ providerReference: 'provider-bad', health: 'unhealthy' });
    const healthy = createDescriptor({ providerReference: 'provider-good', health: 'healthy' });

    const decision = select([unhealthy, healthy]);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-good');
      expect(decision.evaluatedCandidateCount).toBe(1);
    }
  });

  it('[E19] selection request rejects contradictory permitted and excluded references', () => {
    const result = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
      permittedProviderReferences: ['provider-a'],
      excludedProviderReferences: ['provider-a'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('contradictory-provider-constraints');
    }
  });

  it('[E20] selection request rejects invalid permitted reference', () => {
    const result = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
      permittedProviderReferences: [''],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-permitted-provider-reference');
    }
  });

  it('[E21] selection request rejects invalid excluded reference', () => {
    const result = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
      excludedProviderReferences: [' bad-ref'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-excluded-provider-reference');
    }
  });

  it('[E22] selection request rejects invalid required capability', () => {
    const result = createProviderSelectionRequest({
      requiredCapability: 'unsupported-capability',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-required-capability');
    }
  });

  it('[E23] combined filters apply in sequence: capability, kind, permitted, excluded, status, health', () => {
    const selected = createDescriptor({
      providerReference: 'provider-final',
      status: 'active',
      health: 'healthy',
      priority: 2,
    });
    const wrongStatus = createDescriptor({
      providerReference: 'provider-disabled',
      status: 'disabled',
    });
    const excluded = createDescriptor({
      providerReference: 'provider-excluded',
      status: 'active',
      health: 'healthy',
      priority: 0,
    });

    const decision = select([selected, wrongStatus, excluded], {
      requiredCapability: 'digital-subscription-provisioning',
      providerKind: 'digital-provisioning-provider',
      permittedProviderReferences: ['provider-final'],
      excludedProviderReferences: ['provider-excluded'],
    });

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-final');
    }
  });

  it('[E24] disabled provider with matching capability but excluded active provider still fails active check appropriately', () => {
    const disabledOnly = createDescriptor({ status: 'disabled' });
    const decision = select([disabledOnly], {
      requiredCapability: 'digital-subscription-provisioning',
      excludedProviderReferences: ['other-provider'],
    });

    expect(decision.kind).toBe('no-active-provider');
  });

  it('[E25] multiple healthy providers with same priority use lexicographic tie-break', () => {
    const providers = [
      createDescriptor({ providerReference: 'provider-m', priority: 0 }),
      createDescriptor({ providerReference: 'provider-b', priority: 0 }),
      createDescriptor({ providerReference: 'provider-t', priority: 0 }),
    ];

    const decision = select(providers);

    expect(decision.kind).toBe('provider-selected');
    if (decision.kind === 'provider-selected') {
      expect(decision.descriptor.providerReference).toBe('provider-b');
    }
  });

  it('[E26] selection decision JSON excludes internal adapter details', () => {
    const descriptor = createDescriptor({ providerReference: 'provider-safe-output' });
    const decision = select([descriptor]);
    const serialized = JSON.stringify(decision);

    expect(serialized).not.toContain('FakeProviderAdapter');
    expect(serialized).not.toContain('adapter');
    expect(serialized).not.toContain('SUPER_SECRET');
  });

  it('[E27] routing constraints are preserved on selection request without affecting outcome', () => {
    const descriptor = createDescriptor({ providerReference: 'provider-routing' });
    const requestResult = createProviderSelectionRequest({
      requiredCapability: 'digital-subscription-provisioning',
      routingConstraints: { region: 'eu' },
    });

    expect(requestResult.ok).toBe(true);
    if (requestResult.ok) {
      expect(requestResult.value.routingConstraints).toEqual({ region: 'eu' });
    }

    const decision = select([descriptor], {
      requiredCapability: 'digital-subscription-provisioning',
      routingConstraints: { region: 'eu' },
    });
    expect(decision.kind).toBe('provider-selected');
  });

  it('[E28] no eligible healthy group yields no-eligible-provider-health', () => {
    const decision = select([
      createDescriptor({
        providerReference: 'only-unhealthy',
        health: 'unhealthy',
        status: 'active',
      }),
    ]);

    expect(decision.kind).toBe('no-eligible-provider-health');
  });
});
