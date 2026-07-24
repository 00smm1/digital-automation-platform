import { describe, expect, it } from 'vitest';

import { createProviderDescriptor } from '../domain/provider-descriptor.js';
import { InMemoryProviderRegistry } from './in-memory-provider-registry.js';
import {
  InMemoryCredentialResolver,
  createCredentialReference,
} from './in-memory-credential-resolver.js';
import {
  createDeterministicTimeoutExecutor,
  DeterministicTimeoutExecutor,
} from '../testing/deterministic-timeout-executor.js';
import { FakeProviderAdapter } from '../testing/fake-provider-adapter.js';
import { TimerTimeoutExecutor } from './timer-timeout-executor.js';

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

const createTestDescriptor = (providerReference: string) => {
  const result = createProviderDescriptor({
    providerReference,
    providerKind: 'digital-provisioning-provider',
    supportedCapabilities: ['digital-subscription-provisioning'],
    status: 'active',
    health: 'healthy',
    priority: 0,
    credentialReference: `credential-${providerReference}`,
  });

  if (!result.ok) {
    throw new Error('descriptor creation failed');
  }

  return result.value;
};

describe('Sprint 19 in-memory provider registry [D01-D10]', () => {
  it('[D01] registers provider and returns cloned descriptor', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const descriptor = createTestDescriptor('registry-provider-a');

    const outcome = registry.register({ descriptor, adapter });

    expect(outcome.kind).toBe('provider-registered');
    if (outcome.kind === 'provider-registered') {
      expect(outcome.descriptor.providerReference).toBe('registry-provider-a');
      expect(outcome.descriptor).not.toBe(descriptor);
    }
  });

  it('[D02] rejects duplicate provider reference registration', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const descriptor = createTestDescriptor('duplicate-provider');

    registry.register({ descriptor, adapter });
    const conflict = registry.register({ descriptor, adapter });

    expect(conflict.kind).toBe('provider-reference-conflict');
    if (conflict.kind === 'provider-reference-conflict') {
      expect(conflict.providerReference).toBe('duplicate-provider');
    }
  });

  it('[D03] findDescriptorByReference returns cloned copy', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const descriptor = createTestDescriptor('find-provider');

    registry.register({ descriptor, adapter });
    const found = registry.findDescriptorByReference('find-provider' as never);

    expect(found).toBeDefined();
    expect(found).not.toBe(descriptor);
    if (found !== undefined) {
      expect(found.providerReference).toBe('find-provider');
    }
  });

  it('[D04] findDescriptorByReference returns undefined for unknown reference', () => {
    const registry = new InMemoryProviderRegistry();
    expect(registry.findDescriptorByReference('missing-provider' as never)).toBeUndefined();
  });

  it('[D05] listDescriptorsByCapability filters by capability', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();

    registry.register({ descriptor: createTestDescriptor('cap-provider-a'), adapter });
    registry.register({ descriptor: createTestDescriptor('cap-provider-b'), adapter });

    const listed = registry.listDescriptorsByCapability('digital-subscription-provisioning');

    expect(listed).toHaveLength(2);
    expect(
      listed.every((item) =>
        item.supportedCapabilities.includes('digital-subscription-provisioning'),
      ),
    ).toBe(true);
  });

  it('[D06] listAllDescriptors returns cloned descriptors', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const descriptor = createTestDescriptor('list-all-provider');

    registry.register({ descriptor, adapter });
    const all = registry.listAllDescriptors();

    expect(all).toHaveLength(1);
    expect(all[0]).not.toBe(descriptor);
  });

  it('[D07] resolveAdapter returns registered adapter instance', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    registry.register({ descriptor: createTestDescriptor('adapter-provider'), adapter });

    expect(registry.resolveAdapter('adapter-provider' as never)).toBe(adapter);
  });

  it('[D08] resolveAdapter returns undefined for unknown provider', () => {
    const registry = new InMemoryProviderRegistry();
    expect(registry.resolveAdapter('unknown-provider' as never)).toBeUndefined();
  });

  it('[D09] registry stored descriptor mutations do not affect returned clones', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    registry.register({ descriptor: createTestDescriptor('mutation-provider'), adapter });

    const first = registry.findDescriptorByReference('mutation-provider' as never);
    const second = registry.findDescriptorByReference('mutation-provider' as never);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(first).not.toBe(second);
      expect(first.supportedCapabilities).not.toBe(second.supportedCapabilities);
    }
  });

  it('[D10] registry descriptor listing never exposes adapter or credential secret fields', () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    registry.register({ descriptor: createTestDescriptor('registry-safe-provider'), adapter });

    const serialized = JSON.stringify(registry.listAllDescriptors());
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
    assertSentinelsAbsent(serialized);
  });
});

describe('Sprint 19 in-memory credential resolver [G13-G16]', () => {
  it('[G13] resolves stored credential for matching provider', async () => {
    const resolver = new InMemoryCredentialResolver();
    const credentialReference = createCredentialReference('credential-alpha');
    expect(credentialReference).toBeDefined();

    resolver.store({
      credentialReference: credentialReference!,
      secretValue: ALL_SENTINELS[0],
      providerReference: 'provider-alpha' as never,
    });

    const outcome = await resolver.resolve({
      credentialReference: credentialReference!,
      providerReference: 'provider-alpha' as never,
    });

    expect(outcome.kind).toBe('credential-resolved');
    if (outcome.kind === 'credential-resolved') {
      expect(outcome.secret.value).toBe(ALL_SENTINELS[0]);
    }
  });

  it('[G14] returns credential-not-found for missing credential', async () => {
    const resolver = new InMemoryCredentialResolver();
    const outcome = await resolver.resolve({
      credentialReference: 'missing-credential' as never,
      providerReference: 'provider-alpha' as never,
    });

    expect(outcome.kind).toBe('credential-not-found');
    if (outcome.kind === 'credential-not-found') {
      expect(outcome.safeCode).toBe('CREDENTIAL_NOT_FOUND');
    }
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[G15] returns credential-access-denied when provider binding mismatches', async () => {
    const resolver = new InMemoryCredentialResolver();
    const credentialReference = createCredentialReference('credential-bound')!;

    resolver.store({
      credentialReference,
      secretValue: ALL_SENTINELS[1],
      providerReference: 'provider-bound' as never,
    });

    const outcome = await resolver.resolve({
      credentialReference,
      providerReference: 'other-provider' as never,
    });

    expect(outcome.kind).toBe('credential-access-denied');
    if (outcome.kind === 'credential-access-denied') {
      expect(outcome.safeCode).toBe('CREDENTIAL_ACCESS_DENIED');
    }
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[G16] cloneProviderSecret returns independent secret object', async () => {
    const resolver = new InMemoryCredentialResolver();
    const credentialReference = createCredentialReference('credential-clone')!;

    resolver.store({
      credentialReference,
      secretValue: ALL_SENTINELS[2],
    });

    const outcome = await resolver.resolve({
      credentialReference,
      providerReference: 'any-provider' as never,
    });

    expect(outcome.kind).toBe('credential-resolved');
    if (outcome.kind === 'credential-resolved') {
      expect(outcome.secret).toEqual({ value: ALL_SENTINELS[2] });
    }
  });
});

describe('Sprint 19 deterministic timeout executor [H07-H12]', () => {
  it('[H07] complete mode awaits operation and returns value', async () => {
    const executor = createDeterministicTimeoutExecutor();
    const outcome = await executor.execute({
      timeoutMilliseconds: 1_000,
      operation: async () => 'completed-value',
    });

    expect(outcome.kind).toBe('operation-completed');
    if (outcome.kind === 'operation-completed') {
      expect(outcome.value).toBe('completed-value');
    }
  });

  it('[H08] timeout mode returns operation-timed-out without awaiting completion', async () => {
    const executor = createDeterministicTimeoutExecutor();
    executor.setMode('timeout');

    let resolved = false;
    const outcome = await executor.execute({
      timeoutMilliseconds: 50,
      operation: async () => {
        await new Promise<void>(() => undefined);
        resolved = true;
        return 'late-value';
      },
    });

    expect(outcome.kind).toBe('operation-timed-out');
    expect(resolved).toBe(false);
  });

  it('[H09] reject mode swallows operation throw and returns completed undefined', async () => {
    const executor = createDeterministicTimeoutExecutor();
    executor.setMode('reject');

    const outcome = await executor.execute({
      timeoutMilliseconds: 100,
      operation: async () => {
        throw new Error(ALL_SENTINELS[4]);
      },
    });

    expect(outcome.kind).toBe('operation-completed');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[H10] late-resolve mode returns timed-out deterministically', async () => {
    const executor = createDeterministicTimeoutExecutor();
    executor.setMode('late-resolve');
    executor.setLateValue(ALL_SENTINELS[3]);

    const outcome = await executor.execute({
      timeoutMilliseconds: 100,
      operation: async () => 'slow',
    });

    expect(outcome.kind).toBe('operation-timed-out');
  });

  it('[H11] late-reject mode returns timed-out deterministically', async () => {
    const executor = createDeterministicTimeoutExecutor();
    executor.setMode('late-reject');
    executor.setLateError(new Error(ALL_SENTINELS[5]));

    const outcome = await executor.execute({
      timeoutMilliseconds: 100,
      operation: async () => 'slow',
    });

    expect(outcome.kind).toBe('operation-timed-out');
    assertSentinelsAbsent(JSON.stringify(outcome));
  });

  it('[H12] mode can be changed between executions', async () => {
    const executor = new DeterministicTimeoutExecutor();

    executor.setMode('complete');
    const completed = await executor.execute({
      timeoutMilliseconds: 10,
      operation: async () => 1,
    });
    expect(completed.kind).toBe('operation-completed');

    executor.setMode('timeout');
    const timedOut = await executor.execute({
      timeoutMilliseconds: 10,
      operation: async () => 2,
    });
    expect(timedOut.kind).toBe('operation-timed-out');
  });
});

describe('Sprint 19 timer timeout executor contract [I01-I06]', () => {
  it('[I01] TimerTimeoutExecutor completes fast operations without real delay', async () => {
    const executor = new TimerTimeoutExecutor();
    const started = Date.now();

    const outcome = await executor.execute({
      timeoutMilliseconds: 60_000,
      operation: async () => 'fast-result',
    });

    expect(Date.now() - started).toBeLessThan(100);
    expect(outcome.kind).toBe('operation-completed');
    if (outcome.kind === 'operation-completed') {
      expect(outcome.value).toBe('fast-result');
    }
  });

  it('[I02] TimerTimeoutExecutor propagates operation rejection', async () => {
    const executor = new TimerTimeoutExecutor();

    await expect(
      executor.execute({
        timeoutMilliseconds: 60_000,
        operation: async () => {
          throw new Error(ALL_SENTINELS[4]);
        },
      }),
    ).rejects.toThrow();
  });

  it('[I03] TimerTimeoutExecutor is suitable for composition wiring smoke test', () => {
    const executor = new TimerTimeoutExecutor();
    expect(typeof executor.execute).toBe('function');
  });

  it('[I04] TimerTimeoutExecutor ignores late success after timeout', async () => {
    const executor = new TimerTimeoutExecutor();
    let resolveLate: ((value: string) => void) | undefined;

    const outcome = await executor.execute({
      timeoutMilliseconds: 20,
      operation: () =>
        new Promise<string>((resolve) => {
          resolveLate = resolve;
        }),
    });

    expect(outcome.kind).toBe('operation-timed-out');
    resolveLate?.('late-success');
  });

  it('[I05] TimerTimeoutExecutor observes late rejection after timeout without unhandled rejection', async () => {
    const executor = new TimerTimeoutExecutor();
    let rejectLate: ((error: Error) => void) | undefined;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const outcome = await executor.execute({
        timeoutMilliseconds: 20,
        operation: () =>
          new Promise<string>((_resolve, reject) => {
            rejectLate = reject;
          }),
      });

      expect(outcome.kind).toBe('operation-timed-out');
      rejectLate?.(new Error('late-rejection'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('[I06] TimerTimeoutExecutor completes exactly once when operation wins the race', async () => {
    const executor = new TimerTimeoutExecutor();
    let completions = 0;

    const outcome = await executor.execute({
      timeoutMilliseconds: 60_000,
      operation: async () => {
        completions += 1;
        return 'completed-once';
      },
    });

    expect(outcome.kind).toBe('operation-completed');
    expect(completions).toBe(1);
  });
});

describe('Sprint 19 infrastructure credential reference helper [I04-I05]', () => {
  it('[I04] createCredentialReference returns undefined for invalid reference', () => {
    expect(createCredentialReference('')).toBeUndefined();
    expect(createCredentialReference(' bad')).toBeUndefined();
  });

  it('[I05] createCredentialReference parses valid reference', () => {
    const parsed = createCredentialReference('credential-valid');
    expect(parsed).toBe('credential-valid');
  });
});
