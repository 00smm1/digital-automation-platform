import { describe, expect, it } from 'vitest';

import { FakeProviderAdapter, SENTINEL_FAKE_PROVIDER_SECRET } from './fake-provider-adapter.js';
import { InMemoryCredentialResolver } from '../infrastructure/in-memory-credential-resolver.js';
import { createProviderExecutionContextFromClock } from '../application/provider-execution-context.js';
import { FakeClock } from '../shared/clock.js';
import { createProviderExecutionRequest } from '../application/provider-execution-request.js';

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

const validRequestInput = {
  executionRunReference: 'run-fake-001',
  externalOrderReference: 'order-fake-001',
  reservationReference: 'res-fake-001',
  inventoryItemReference: 'item-fake-001',
  requiredCapability: 'digital-subscription-provisioning',
  quantity: 1,
  fulfillmentDefinitionReference: 'fulfillment-fake-001',
  provisioningParameters: {
    kind: 'digital-subscription',
    planReference: 'plan-fake',
    durationReference: 'duration-fake',
  },
  businessIdempotencyReference: 'idempotency-fake-001',
};

const createExecutionPair = () => {
  const requestResult = createProviderExecutionRequest(validRequestInput);
  if (!requestResult.ok) {
    throw new Error('request setup failed');
  }

  const clock = new FakeClock(new Date('2026-07-24T10:00:00.000Z'));
  const context = createProviderExecutionContextFromClock({
    clock,
    executionAttemptReference: 'attempt-fake-001' as never,
    providerReference: 'fake-provider' as never,
    credentialReference: 'credential-fake' as never,
    timeoutMilliseconds: 5_000,
    businessIdempotencyReference: requestResult.value.businessIdempotencyReference,
  });

  return { request: requestResult.value, context, clock };
};

describe('Sprint 19 fake provider adapter modes [J01-J10]', () => {
  it('[J01] success mode returns provisioned adapter result', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('provider-adapter-succeeded');
    if (result.kind === 'provider-adapter-succeeded') {
      expect(result.safeResultCode).toBe('PROVISIONED');
      expect(result.externalProvisioningReference).toContain(
        'external-provision-idempotency-fake-001',
      );
      expect(result.deliveryMaterialReference).toContain('delivery-');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[J02] rejected mode returns provider-adapter-rejected', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('rejected');
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('provider-adapter-rejected');
    if (result.kind === 'provider-adapter-rejected') {
      expect(result.safeResultCode).toBe('PROVIDER_REJECTED');
    }
  });

  it('[J03] unavailable mode returns provider-adapter-unavailable', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('unavailable');
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('provider-adapter-unavailable');
  });

  it('[J04] throw mode propagates configured exception', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('throw');
    adapter.setConfiguredException(new Error(ALL_SENTINELS[4]));
    const { request, context } = createExecutionPair();

    await expect(adapter.execute(request, context)).rejects.toThrow(ALL_SENTINELS[4]);
  });

  it('[J05] invalid-response mode returns succeeded with empty external reference', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('invalid-response');
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('provider-adapter-succeeded');
    if (result.kind === 'provider-adapter-succeeded') {
      expect(result.externalProvisioningReference).toBe('');
    }
  });

  it('[J06] pending mode waits until resolvePending is called', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('pending');
    const { request, context } = createExecutionPair();

    const pending = adapter.execute(request, context);
    expect(adapter.getInvocationCount()).toBe(1);

    adapter.resolvePending({
      kind: 'provider-adapter-succeeded',
      externalProvisioningReference: 'external-pending-001',
      safeResultCode: 'PROVISIONED',
    });

    const result = await pending;
    expect(result.kind).toBe('provider-adapter-succeeded');
  });

  it('[J07] credential-failure mode returns credential-resolution-failed', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('credential-failure');
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('credential-resolution-failed');
  });

  it('[J08] records invocation metadata for each execute call', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    await adapter.execute(request, context);
    await adapter.execute(
      { ...request, businessIdempotencyReference: 'idempotency-fake-002' as never },
      context,
    );

    expect(adapter.getInvocationCount()).toBe(2);
    expect(adapter.getInvocations()).toHaveLength(2);
    expect(adapter.getInvocations()[0]?.capability).toBe('digital-subscription-provisioning');
    assertSentinelsAbsent(JSON.stringify(adapter.getInvocations()));
  });

  it('[J09] reset clears invocation history and mode', async () => {
    const adapter = new FakeProviderAdapter();
    adapter.setMode('rejected');
    const { request, context } = createExecutionPair();

    await adapter.execute(request, context);
    adapter.reset();

    expect(adapter.getInvocationCount()).toBe(0);
    expect(adapter.getInvocations()).toHaveLength(0);

    const result = await adapter.execute(request, context);
    expect(result.kind).toBe('provider-adapter-succeeded');
  });

  it('[J10] setMode switches behavior between calls', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    adapter.setMode('rejected');
    const rejected = await adapter.execute(request, context);
    expect(rejected.kind).toBe('provider-adapter-rejected');

    adapter.setMode('success');
    const success = await adapter.execute(
      { ...request, businessIdempotencyReference: 'idempotency-switch' as never },
      context,
    );
    expect(success.kind).toBe('provider-adapter-succeeded');
  });
});

describe('Sprint 19 fake provider adapter credential integration [J11-J13]', () => {
  it('[J11] resolves credential through injected resolver and marks credential used', async () => {
    const resolver = new InMemoryCredentialResolver();
    resolver.store({
      credentialReference: 'credential-fake' as never,
      secretValue: SENTINEL_FAKE_PROVIDER_SECRET,
      providerReference: 'fake-provider' as never,
    });

    const adapter = new FakeProviderAdapter({ credentialResolver: resolver });
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('provider-adapter-succeeded');
    expect(adapter.wasCredentialUsed()).toBe(true);
    expect(SENTINEL_FAKE_PROVIDER_SECRET).toBe(ALL_SENTINELS[0]);
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[J12] returns credential-resolution-failed when resolver cannot find credential', async () => {
    const resolver = new InMemoryCredentialResolver();
    const adapter = new FakeProviderAdapter({ credentialResolver: resolver });
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    expect(result.kind).toBe('credential-resolution-failed');
    expect(adapter.wasCredentialUsed()).toBe(false);
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[J13] adapter result never serializes resolved secret value', async () => {
    const resolver = new InMemoryCredentialResolver();
    resolver.store({
      credentialReference: 'credential-fake' as never,
      secretValue: ALL_SENTINELS[1],
      providerReference: 'fake-provider' as never,
    });

    const adapter = new FakeProviderAdapter({ credentialResolver: resolver });
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 19 fake provider adapter idempotency [J14-J18]', () => {
  it('[J14] replays same business idempotency key without creating new external reference', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    const first = await adapter.execute(request, context);
    const second = await adapter.execute(request, context);

    expect(first.kind).toBe('provider-adapter-succeeded');
    expect(second.kind).toBe('provider-adapter-succeeded');
    if (
      first.kind === 'provider-adapter-succeeded' &&
      second.kind === 'provider-adapter-succeeded'
    ) {
      expect(second.externalProvisioningReference).toBe(first.externalProvisioningReference);
      expect(second.safeResultCode).toBe('IDEMPOTENT_REPLAY');
    }
    expect(adapter.getInvocationCount()).toBe(2);
  });

  it('[J15] different idempotency keys produce distinct external references', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    const first = await adapter.execute(request, context);
    const second = await adapter.execute(
      { ...request, businessIdempotencyReference: 'idempotency-other' as never },
      context,
    );

    if (
      first.kind === 'provider-adapter-succeeded' &&
      second.kind === 'provider-adapter-succeeded'
    ) {
      expect(second.externalProvisioningReference).not.toBe(first.externalProvisioningReference);
    }
  });

  it('[J16] idempotent replay includes delivery material reference', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    const first = await adapter.execute(request, context);
    const second = await adapter.execute(request, context);

    if (
      first.kind === 'provider-adapter-succeeded' &&
      second.kind === 'provider-adapter-succeeded'
    ) {
      expect(second.deliveryMaterialReference).toBe(first.deliveryMaterialReference);
    }
  });

  it('[J17] reset clears idempotency store', async () => {
    const adapter = new FakeProviderAdapter();
    const { request, context } = createExecutionPair();

    const first = await adapter.execute(request, context);
    adapter.reset();
    const afterReset = await adapter.execute(request, context);

    if (
      first.kind === 'provider-adapter-succeeded' &&
      afterReset.kind === 'provider-adapter-succeeded'
    ) {
      expect(afterReset.safeResultCode).toBe('PROVISIONED');
    }
  });

  it('[J18] custom providerReferencePrefix appears in generated external reference', async () => {
    const adapter = new FakeProviderAdapter({ providerReferencePrefix: 'custom-prefix' });
    const { request, context } = createExecutionPair();

    const result = await adapter.execute(request, context);

    if (result.kind === 'provider-adapter-succeeded') {
      expect(result.externalProvisioningReference).toContain('custom-prefix-idempotency-fake-001');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });
});
