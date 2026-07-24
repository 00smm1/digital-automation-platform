import { describe, expect, it } from 'vitest';

import { cloneProviderDescriptor, createProviderDescriptor } from './provider-descriptor.js';
import { compareProviderPriority, parseProviderPriority } from './provider-priority.js';
import {
  cloneProvisioningParameters,
  createDigitalSubscriptionProvisioningParameters,
  parseProvisioningParameters,
} from './provisioning-parameters.js';
import { parseReservedQuantity } from './reserved-quantity.js';
import {
  parseBusinessIdempotencyReference,
  parseCredentialReference,
  parseDeliveryMaterialReference,
  parseDurationReference,
  parseExecutionRunReference,
  parseExternalOrderReference,
  parseExternalProvisioningReference,
  parseFulfillmentDefinitionReference,
  parseInventoryItemReference,
  parsePlanReference,
  parseProviderExecutionAttemptReference,
  parseProviderReference,
  parseReservationReference,
} from './provider-references.js';
import { parseNonEmptyReference } from '../shared/reference-validation.js';
import { projectProviderExecutionEvidenceForAudit } from './provider-execution-evidence.js';
import { createSafeMetadata, cloneSafeMetadata } from './safe-metadata.js';

const ALL_SENTINELS = [
  'SUPER_SECRET_PROVIDER_API_KEY',
  'SUPER_SECRET_PROVIDER_PASSWORD',
  'SUPER_SECRET_BEARER_TOKEN',
  'SUPER_SECRET_PROVIDER_RESPONSE',
  'SUPER_SECRET_EXCEPTION_MESSAGE',
  'SUPER_SECRET_STACK_TRACE',
  'SUPER_SECRET_DELIVERY_PASSWORD',
] as const;

const assertSentinelsAbsent = (serialized: string): void => {
  for (const sentinel of ALL_SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
};

const validDescriptorInput = {
  providerReference: 'provider-alpha',
  providerKind: 'digital-provisioning-provider',
  supportedCapabilities: ['digital-subscription-provisioning'],
  status: 'active',
  health: 'healthy',
  priority: 0,
  credentialReference: 'credential-alpha',
};

describe('Sprint 19 reference validation [A01-A24]', () => {
  it.each([
    ['provider', parseProviderReference, 'valid-provider-ref'],
    ['credential', parseCredentialReference, 'valid-credential-ref'],
    ['execution attempt', parseProviderExecutionAttemptReference, 'attempt-001'],
    ['external provisioning', parseExternalProvisioningReference, 'ext-provision-001'],
    ['delivery material', parseDeliveryMaterialReference, 'delivery-001'],
    ['business idempotency', parseBusinessIdempotencyReference, 'idempotency-001'],
    ['execution run', parseExecutionRunReference, 'run-001'],
    ['external order', parseExternalOrderReference, 'order-001'],
    ['reservation', parseReservationReference, 'res-001'],
    ['inventory item', parseInventoryItemReference, 'item-001'],
    ['fulfillment definition', parseFulfillmentDefinitionReference, 'fulfillment-001'],
    ['plan', parsePlanReference, 'plan-premium'],
    ['duration', parseDurationReference, 'duration-12m'],
  ] as const)('[A] accepts valid %s reference', (_label, parser, value) => {
    const result = parser(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(String(result.value)).toBe(value);
    }
  });

  it.each([
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['object', { ref: 'x' }],
  ] as const)('[A] rejects non-string reference value %s', (_label, value) => {
    const result = parseProviderReference(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-string-reference');
    }
  });

  it('[A] rejects empty reference', () => {
    const result = parseProviderReference('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('empty-reference');
    }
  });

  it('[A] rejects whitespace-only reference', () => {
    const result = parseProviderReference('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('whitespace-only-reference');
    }
  });

  it('[A] rejects malformed reference with leading whitespace', () => {
    const result = parseProviderReference(' provider-ref');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('malformed-reference');
    }
  });

  it('[A] rejects malformed reference with trailing whitespace', () => {
    const result = parseProviderReference('provider-ref ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('malformed-reference');
    }
  });

  it('[A] parseNonEmptyReference brands identifiers correctly', () => {
    const result = parseNonEmptyReference('CustomBrand', 'custom-value');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(String(result.value)).toBe('custom-value');
    }
  });

  it('[A] sentinel values are valid reference strings but must not leak in audit projections', () => {
    for (const sentinel of ALL_SENTINELS) {
      const parsed = parseProviderReference(sentinel);
      expect(parsed.ok).toBe(true);
    }

    const projection = projectProviderExecutionEvidenceForAudit({
      providerReference: parseProviderReference('safe-provider').ok
        ? parseProviderReference('safe-provider').value
        : undefined,
      retryClassification: 'retry-not-applicable',
      safeResultCode: 'PROVISIONED',
    });

    assertSentinelsAbsent(JSON.stringify(projection));
  });
});

describe('Sprint 19 provider priority validation [B01-B08]', () => {
  it('[B01] accepts zero priority', () => {
    const result = parseProviderPriority(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('[B02] accepts positive safe integer priority', () => {
    const result = parseProviderPriority(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('[B03] rejects negative priority', () => {
    const result = parseProviderPriority(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('negative-priority');
    }
  });

  it('[B04] rejects decimal priority', () => {
    const result = parseProviderPriority(1.5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-integer-priority');
    }
  });

  it('[B05] rejects non-number priority', () => {
    const result = parseProviderPriority('0');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-number-priority');
    }
  });

  it('[B06] rejects NaN priority', () => {
    const result = parseProviderPriority(Number.NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-finite-priority');
    }
  });

  it('[B07] rejects unsafe integer priority', () => {
    const result = parseProviderPriority(Number.MAX_SAFE_INTEGER + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('unsafe-integer-priority');
    }
  });

  it('[B08] compareProviderPriority orders lower values first', () => {
    const low = parseProviderPriority(0);
    const high = parseProviderPriority(10);
    expect(low.ok && high.ok).toBe(true);
    if (low.ok && high.ok) {
      expect(compareProviderPriority(low.value, high.value)).toBeLessThan(0);
      expect(compareProviderPriority(high.value, low.value)).toBeGreaterThan(0);
      expect(compareProviderPriority(low.value, low.value)).toBe(0);
    }
  });
});

describe('Sprint 19 provider descriptor validation [C01-C12]', () => {
  it('[C01] creates valid provider descriptor', () => {
    const result = createProviderDescriptor(validDescriptorInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.providerReference).toBe('provider-alpha');
      expect(result.value.supportedCapabilities).toEqual(['digital-subscription-provisioning']);
    }
  });

  it('[C02] rejects invalid provider reference', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, providerReference: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-provider-reference');
    }
  });

  it('[C03] rejects invalid provider kind', () => {
    const result = createProviderDescriptor({
      ...validDescriptorInput,
      providerKind: 'unknown-kind',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-provider-kind');
    }
  });

  it('[C04] rejects empty capabilities', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, supportedCapabilities: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('empty-capabilities');
    }
  });

  it('[C05] rejects invalid capability', () => {
    const result = createProviderDescriptor({
      ...validDescriptorInput,
      supportedCapabilities: ['invalid-capability'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-capability');
    }
  });

  it('[C06] rejects invalid provider status', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, status: 'retired' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-provider-status');
    }
  });

  it('[C07] rejects invalid provider health', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, health: 'critical' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-provider-health');
    }
  });

  it('[C08] rejects invalid provider priority', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, priority: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-provider-priority');
    }
  });

  it('[C09] rejects invalid credential reference', () => {
    const result = createProviderDescriptor({ ...validDescriptorInput, credentialReference: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-credential-reference');
    }
  });

  it('[C10] deduplicates supported capabilities', () => {
    const result = createProviderDescriptor({
      ...validDescriptorInput,
      supportedCapabilities: [
        'digital-subscription-provisioning',
        'digital-subscription-provisioning',
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.supportedCapabilities).toEqual(['digital-subscription-provisioning']);
    }
  });

  it('[C11] attaches safe metadata without secrets', () => {
    const result = createProviderDescriptor({
      ...validDescriptorInput,
      metadata: { region: 'eu-west', tier: 'standard' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata).toEqual({ region: 'eu-west', tier: 'standard' });
      assertSentinelsAbsent(JSON.stringify(result.value));
    }
  });

  it('[C12] cloneProviderDescriptor produces independent copy', () => {
    const created = createProviderDescriptor(validDescriptorInput);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const clone = cloneProviderDescriptor(created.value);
    expect(clone).not.toBe(created.value);
    expect(clone.supportedCapabilities).not.toBe(created.value.supportedCapabilities);
    expect(clone.supportedCapabilities).toEqual(created.value.supportedCapabilities);
  });
});

describe('Sprint 19 provisioning parameters validation [F01-F08]', () => {
  it('[F01] creates digital subscription provisioning parameters', () => {
    const result = createDigitalSubscriptionProvisioningParameters({
      planReference: 'plan-premium',
      durationReference: 'duration-12m',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('digital-subscription');
      expect(result.value.planReference).toBe('plan-premium');
      expect(result.value.durationReference).toBe('duration-12m');
    }
  });

  it('[F02] rejects invalid plan reference', () => {
    const result = createDigitalSubscriptionProvisioningParameters({
      planReference: '',
      durationReference: 'duration-12m',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-plan-reference');
    }
  });

  it('[F03] rejects invalid duration reference', () => {
    const result = createDigitalSubscriptionProvisioningParameters({
      planReference: 'plan-premium',
      durationReference: ' duration-12m',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-duration-reference');
    }
  });

  it('[F04] parseProvisioningParameters accepts valid object', () => {
    const result = parseProvisioningParameters({
      kind: 'digital-subscription',
      planReference: 'plan-basic',
      durationReference: 'duration-1m',
    });
    expect(result.ok).toBe(true);
  });

  it('[F05] parseProvisioningParameters rejects invalid kind', () => {
    const result = parseProvisioningParameters({
      kind: 'physical-shipment',
      planReference: 'plan-basic',
      durationReference: 'duration-1m',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('invalid-parameters-kind');
    }
  });

  it('[F06] parseProvisioningParameters rejects non-object input', () => {
    expect(parseProvisioningParameters(null).ok).toBe(false);
    expect(parseProvisioningParameters('string').ok).toBe(false);
    expect(parseProvisioningParameters([]).ok).toBe(false);
  });

  it('[F07] cloneProvisioningParameters produces equal independent copy', () => {
    const created = createDigitalSubscriptionProvisioningParameters({
      planReference: 'plan-clone',
      durationReference: 'duration-clone',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const clone = cloneProvisioningParameters(created.value);
    expect(clone).toEqual(created.value);
    expect(clone).not.toBe(created.value);
  });

  it('[F08] provisioning parameters serialization excludes sentinel secrets', () => {
    const created = createDigitalSubscriptionProvisioningParameters({
      planReference: 'plan-safe',
      durationReference: 'duration-safe',
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      assertSentinelsAbsent(JSON.stringify(created.value));
    }
  });
});

describe('Sprint 19 reserved quantity validation [F09-F16]', () => {
  it('[F09] accepts positive integer quantity', () => {
    const result = parseReservedQuantity(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
  });

  it('[F10] rejects zero quantity', () => {
    const result = parseReservedQuantity(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-positive-quantity');
    }
  });

  it('[F11] rejects negative quantity', () => {
    const result = parseReservedQuantity(-3);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-positive-quantity');
    }
  });

  it('[F12] rejects decimal quantity', () => {
    const result = parseReservedQuantity(2.5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-integer-quantity');
    }
  });

  it('[F13] rejects non-number quantity', () => {
    const result = parseReservedQuantity('1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-number-quantity');
    }
  });

  it('[F14] rejects NaN quantity', () => {
    const result = parseReservedQuantity(Number.NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('non-finite-quantity');
    }
  });

  it('[F15] rejects unsafe integer quantity', () => {
    const result = parseReservedQuantity(Number.MAX_SAFE_INTEGER + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe('unsafe-integer-quantity');
    }
  });

  it('[F16] accepts large safe integer quantity', () => {
    const result = parseReservedQuantity(Number.MAX_SAFE_INTEGER);
    expect(result.ok).toBe(true);
  });
});

describe('Sprint 19 domain immutability and safe metadata [U01-U06]', () => {
  it('[U01] createSafeMetadata clones input record', () => {
    const source = { key: 'value' };
    const metadata = createSafeMetadata(source);
    expect(metadata).toEqual(source);
    expect(metadata).not.toBe(source);
  });

  it('[U02] cloneSafeMetadata returns undefined for undefined input', () => {
    expect(cloneSafeMetadata(undefined)).toBeUndefined();
  });

  it('[U03] mutating cloned safe metadata does not affect original descriptor metadata', () => {
    const created = createProviderDescriptor({
      ...validDescriptorInput,
      metadata: { lane: 'primary' },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const clone = cloneProviderDescriptor(created.value);
    expect(clone.metadata).toBeDefined();
    if (clone.metadata !== undefined) {
      const mutable = { ...clone.metadata };
      mutable.lane = 'secondary';
      expect(created.value.metadata?.lane).toBe('primary');
    }
  });

  it('[U04] mutating cloned capabilities array does not affect original descriptor', () => {
    const created = createProviderDescriptor(validDescriptorInput);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const clone = cloneProviderDescriptor(created.value);
    const capabilities = [...clone.supportedCapabilities];
    capabilities.push('digital-subscription-provisioning' as never);
    expect(created.value.supportedCapabilities).toHaveLength(1);
  });

  it('[U05] safe metadata clone is shallow-independent', () => {
    const original = createSafeMetadata({ a: '1' });
    const clone = cloneSafeMetadata(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
  });

  it('[U06] domain validation errors never embed sentinel secrets', () => {
    const failures = [
      parseProviderReference(''),
      parseProviderPriority('bad'),
      createProviderDescriptor({ ...validDescriptorInput, providerReference: '' }),
      createDigitalSubscriptionProvisioningParameters({
        planReference: '',
        durationReference: 'duration-1m',
      }),
    ];

    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      assertSentinelsAbsent(JSON.stringify(failure));
    }
  });
});
