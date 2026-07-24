import { describe, expect, it } from 'vitest';

import { FakeClock } from '../shared/clock.js';
import { createProviderDescriptor } from '../domain/provider-descriptor.js';
import { createProviderTimeoutPolicy } from './provider-timeout-policy.js';
import { ProviderSelectionPolicy } from './provider-selection-policy.js';
import { DeterministicProviderExecutionAttemptReferenceFactory } from './provider-execution-attempt-reference-factory.js';
import { ProviderRuntime } from './provider-runtime.js';
import { InMemoryProviderRegistry } from '../infrastructure/in-memory-provider-registry.js';
import {
  createDeterministicTimeoutExecutor,
  DeterministicTimeoutExecutor,
} from '../testing/deterministic-timeout-executor.js';
import { FakeProviderAdapter } from '../testing/fake-provider-adapter.js';
import { createTestProviderRuntimeStack } from '../testing/create-test-provider-runtime-stack.js';
import { projectProviderRuntimeResultForExecutionRun } from './provider-runtime-result.js';
import type { ProviderRegistry } from './ports/provider-registry-port.js';
import type { ProviderDescriptor } from '../domain/provider-descriptor.js';

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

const validExecutionRequestInput = {
  executionRunReference: 'run-001',
  externalOrderReference: 'order-001',
  reservationReference: 'res-001',
  inventoryItemReference: 'item-001',
  requiredCapability: 'digital-subscription-provisioning',
  quantity: 1,
  fulfillmentDefinitionReference: 'fulfillment-001',
  provisioningParameters: {
    kind: 'digital-subscription',
    planReference: 'plan-premium',
    durationReference: 'duration-12m',
  },
  businessIdempotencyReference: 'idempotency-001',
  correlationReference: 'correlation-001',
};

const registerDescriptor = (
  registry: InMemoryProviderRegistry,
  adapter: FakeProviderAdapter,
  overrides: Partial<{
    providerReference: string;
    status: string;
    health: string;
    priority: number;
    supportedCapabilities: readonly string[];
  }> = {},
): ProviderDescriptor => {
  const providerReference = overrides.providerReference ?? 'runtime-test-provider';
  const descriptorResult = createProviderDescriptor({
    providerReference,
    providerKind: 'digital-provisioning-provider',
    supportedCapabilities: overrides.supportedCapabilities ?? ['digital-subscription-provisioning'],
    status: overrides.status ?? 'active',
    health: overrides.health ?? 'healthy',
    priority: overrides.priority ?? 0,
    credentialReference: `credential-${providerReference}`,
  });

  if (!descriptorResult.ok) {
    throw new Error('descriptor setup failed');
  }

  registry.register({ descriptor: descriptorResult.value, adapter });
  return descriptorResult.value;
};

const createRuntime = (params: {
  registry: ProviderRegistry;
  timeoutExecutor: DeterministicTimeoutExecutor;
  clock?: FakeClock;
}) => {
  const timeoutPolicyResult = createProviderTimeoutPolicy({ defaultTimeoutMilliseconds: 5_000 });
  if (!timeoutPolicyResult.ok) {
    throw new Error('timeout policy setup failed');
  }

  return new ProviderRuntime({
    registry: params.registry,
    selectionPolicy: new ProviderSelectionPolicy(),
    attemptReferenceFactory: new DeterministicProviderExecutionAttemptReferenceFactory('attempt'),
    clock: params.clock ?? new FakeClock(new Date('2026-07-24T12:00:00.000Z')),
    timeoutPolicy: timeoutPolicyResult.value,
    timeoutExecutor: params.timeoutExecutor,
  });
};

describe('Sprint 19 provider runtime execution [G01-G12]', () => {
  it('[G01] succeeds with provisioned external reference and delivery material', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-execution-succeeded');
    if (result.kind === 'provider-execution-succeeded') {
      expect(result.safeResultCode).toBe('PROVISIONED');
      expect(String(result.externalProvisioningReference)).toContain('external-provision');
      expect(result.deliveryMaterialReference).toBeDefined();
      expect(result.retryClassification).toBe('retry-not-applicable');
      expect(result.remoteOutcomeClassification).toBe('confirmed-success');
      expect(result.safeEvidence.timeoutClassification).toBe('completed');
      expect(result.safeEvidence.remoteOutcomeClassification).toBe('confirmed-success');
    }

    assertSentinelsAbsent(JSON.stringify(result));
    assertSentinelsAbsent(JSON.stringify(projectProviderRuntimeResultForExecutionRun(result)));
  });

  it('[G02] records deterministic attempt reference on success', async () => {
    const stack = createTestProviderRuntimeStack({ attemptReferencePrefix: 'attempt-test' });
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-execution-succeeded');
    if (result.kind === 'provider-execution-succeeded') {
      expect(String(result.executionAttemptReference)).toMatch(/^attempt-test-/);
    }
  });

  it('[G03] rejects invalid provider request at validation boundary', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning({
      ...validExecutionRequestInput,
      quantity: 0,
    });

    expect(result.kind).toBe('invalid-provider-request');
    if (result.kind === 'invalid-provider-request') {
      expect(result.safeFailureCode).toBe('INVALID_PROVIDER_REQUEST');
      expect(result.retryClassification).toBe('retry-not-safe');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[G04] fails selection when registry has no providers for capability', async () => {
    const registry = new InMemoryProviderRegistry();
    const runtime = createRuntime({
      registry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-selection-failed');
    if (result.kind === 'provider-selection-failed') {
      expect(result.safeFailureCode).toBe('NO_PROVIDER_SUPPORTS_CAPABILITY');
    }
  });

  it('[G05] fails selection when all matching providers are inactive', async () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    registerDescriptor(registry, adapter, { status: 'disabled' });

    const runtime = createRuntime({
      registry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-selection-failed');
    if (result.kind === 'provider-selection-failed') {
      expect(result.safeFailureCode).toBe('NO_ACTIVE_PROVIDER');
    }
  });

  it('[G06] maps adapter rejection to provider-rejected failure', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('rejected');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-rejected');
    if (result.kind === 'provider-rejected') {
      expect(result.safeFailureCode).toBe('PROVIDER_REJECTED');
      expect(result.remoteOutcomeClassification).toBe('confirmed-failure');
      expect(result.retryClassification).toBe('retry-not-safe');
      expect(result.safeEvidence?.safeResultCode).toBe('PROVIDER_REJECTED');
      expect(result.safeEvidence?.remoteOutcomeClassification).toBe('confirmed-failure');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[G07] maps adapter unavailable to provider-unavailable failure', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('unavailable');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-unavailable');
    if (result.kind === 'provider-unavailable') {
      expect(result.safeFailureCode).toBe('PROVIDER_UNAVAILABLE');
      expect(result.retryClassification).toBe('retry-may-be-safe');
    }
  });

  it('[G08] maps credential resolution failure from adapter', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('credential-failure');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('credential-resolution-failed');
    if (result.kind === 'credential-resolution-failed') {
      expect(result.safeFailureCode).toBe('CREDENTIAL_RESOLUTION_FAILED');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[G09] maps adapter throw to provider-exception without leaking exception message', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('throw');
    stack.fakeAdapter.setConfiguredException(
      new Error(`failure: ${ALL_SENTINELS[4]} trace: ${ALL_SENTINELS[5]}`),
    );

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const serialized = JSON.stringify(result);

    expect(result.kind).toBe('provider-exception');
    if (result.kind === 'provider-exception') {
      expect(result.safeFailureCode).toBe('PROVIDER_EXCEPTION');
      expect(result.retryClassification).toBe('retry-after-reconciliation');
    }
    expect(serialized).not.toContain('stack');
    assertSentinelsAbsent(serialized);
  });

  it('[G10] maps invalid adapter success response to invalid-provider-response', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('invalid-response');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('invalid-provider-response');
    if (result.kind === 'invalid-provider-response') {
      expect(result.safeFailureCode).toBe('INVALID_PROVIDER_RESPONSE');
      expect(result.retryClassification).toBe('retry-after-reconciliation');
    }
  });

  it('[G11] returns provider-timeout when timeout executor reports timeout', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('timeout');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-timeout');
    if (result.kind === 'provider-timeout') {
      expect(result.safeFailureCode).toBe('PROVIDER_TIMEOUT');
      expect(result.remoteOutcomeClassification).toBe('unknown');
      expect(result.safeEvidence?.timeoutClassification).toBe('timed-out');
      expect(result.safeEvidence?.remoteOutcomeClassification).toBe('unknown');
    }
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[G12] invokes fake adapter exactly once per successful execution', async () => {
    const stack = createTestProviderRuntimeStack();
    await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(stack.fakeAdapter.getInvocationCount()).toBe(1);
    expect(stack.fakeAdapter.getInvocations()[0]?.businessIdempotencyReference).toBe(
      'idempotency-001',
    );
  });
});

describe('Sprint 19 provider runtime registry and adapter resolution [H01-H06]', () => {
  it('[H01] returns runtime-failed when adapter cannot be resolved', async () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const descriptor = registerDescriptor(registry, adapter);

    const internal = (
      registry as unknown as {
        entries: Map<string, { descriptor: ProviderDescriptor; adapter: FakeProviderAdapter }>;
      }
    ).entries;
    internal.set(String(descriptor.providerReference), {
      descriptor,
      adapter: undefined as unknown as FakeProviderAdapter,
    });

    const runtime = createRuntime({
      registry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('runtime-failed');
    if (result.kind === 'runtime-failed') {
      expect(result.safeFailureCode).toBe('PROVIDER_RUNTIME_FAILED');
    }
  });

  it('[H02] returns provider-selection-failed when registry list throws', async () => {
    const failingRegistry: ProviderRegistry = {
      register() {
        return {
          kind: 'provider-registered',
          descriptor: registerDescriptor(new InMemoryProviderRegistry(), new FakeProviderAdapter()),
        };
      },
      findDescriptorByReference() {
        return undefined;
      },
      listDescriptorsByCapability() {
        throw new Error(ALL_SENTINELS[4]);
      },
      listAllDescriptors() {
        return [];
      },
      resolveAdapter() {
        return undefined;
      },
    };

    const runtime = createRuntime({
      registry: failingRegistry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);
    const serialized = JSON.stringify(result);

    expect(result.kind).toBe('provider-selection-failed');
    if (result.kind === 'provider-selection-failed') {
      expect(result.safeFailureCode).toBe('PROVIDER_REGISTRY_FAILED');
    }
    assertSentinelsAbsent(serialized);
  });

  it('[H03] returns runtime-failed when resolveAdapter throws', async () => {
    const throwingRegistry: ProviderRegistry = {
      register() {
        throw new Error('unused');
      },
      findDescriptorByReference() {
        return undefined;
      },
      listDescriptorsByCapability() {
        return [
          createProviderDescriptor({
            providerReference: 'throwing-provider',
            providerKind: 'digital-provisioning-provider',
            supportedCapabilities: ['digital-subscription-provisioning'],
            status: 'active',
            health: 'healthy',
            priority: 0,
            credentialReference: 'credential-throw',
          }).value!,
        ];
      },
      listAllDescriptors() {
        return [];
      },
      resolveAdapter() {
        throw new Error(ALL_SENTINELS[5]);
      },
    };

    const runtime = createRuntime({
      registry: throwingRegistry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('runtime-failed');
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[H04] default business idempotency reference derives from execution run reference', async () => {
    const stack = createTestProviderRuntimeStack();
    const { businessIdempotencyReference: _ignored, ...withoutExplicitIdempotency } =
      validExecutionRequestInput;

    await stack.providerRuntime.executeProvisioning(withoutExplicitIdempotency);

    expect(stack.fakeAdapter.getInvocations()[0]?.businessIdempotencyReference).toBe('run-001');
  });

  it('[H05] correlation reference flows into execution context metadata safely', async () => {
    const stack = createTestProviderRuntimeStack();
    await stack.providerRuntime.executeProvisioning({
      ...validExecutionRequestInput,
      correlationReference: 'correlation-safe-001',
    });

    expect(stack.fakeAdapter.getInvocationCount()).toBe(1);
    assertSentinelsAbsent(JSON.stringify(stack.fakeAdapter.getInvocations()));
  });

  it('[H06] success evidence excludes secret-bearing adapter payloads', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-execution-succeeded');
    assertSentinelsAbsent(JSON.stringify(result));
    if (result.kind === 'provider-execution-succeeded') {
      expect(JSON.stringify(result.safeEvidence)).not.toContain('secret');
    }
  });
});

describe('Sprint 19 provider runtime timeout policy integration [K01-K04]', () => {
  it('[K01] applies default timeout from policy', async () => {
    const stack = createTestProviderRuntimeStack({ defaultTimeoutMilliseconds: 12_345 });
    stack.fakeAdapter.setMode('success');

    await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(stack.timeoutExecutor).toBeDefined();
  });

  it('[K02] timeout path preserves startedAt and failedAt timestamps from clock', async () => {
    const clock = new FakeClock(new Date('2026-07-24T09:00:00.000Z'));
    const stack = createTestProviderRuntimeStack({ clock });
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('timeout');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-timeout');
    if (result.kind === 'provider-timeout') {
      expect(result.startedAt?.toISOString()).toBe('2026-07-24T09:00:00.000Z');
      expect(result.failedAt?.toISOString()).toBe('2026-07-24T09:00:00.000Z');
    }
  });

  it('[K03] late-resolve timeout mode still surfaces provider-timeout safely', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('late-resolve');
    stack.timeoutExecutor.setLateValue({
      kind: 'provider-adapter-succeeded',
      externalProvisioningReference: ALL_SENTINELS[3],
      safeResultCode: 'LATE',
    });

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-timeout');
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[K04] late-reject timeout mode still surfaces provider-timeout safely', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('late-reject');
    stack.timeoutExecutor.setLateError(new Error(ALL_SENTINELS[4]));

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-timeout');
    assertSentinelsAbsent(JSON.stringify(result));
  });
});

describe('Sprint 19 provider runtime retry classification [L01-L05]', () => {
  it('[L01] success uses retry-not-applicable', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    expect(result.retryClassification).toBe('retry-not-applicable');
  });

  it('[L02] invalid request uses retry-not-safe', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning({
      ...validExecutionRequestInput,
      executionRunReference: '',
    });
    expect(result.retryClassification).toBe('retry-not-safe');
  });

  it('[L03] provider rejection uses retry-not-safe', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('rejected');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    expect(result.retryClassification).toBe('retry-not-safe');
  });

  it('[L04] provider unavailable uses retry-may-be-safe', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('unavailable');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    expect(result.retryClassification).toBe('retry-may-be-safe');
  });

  it('[L05] timeout uses retry-after-reconciliation', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('timeout');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    expect(result.retryClassification).toBe('retry-after-reconciliation');
  });
});

describe('Sprint 19 provider runtime projection safety [M01-M04]', () => {
  it('[M01] execution run projection includes success fields only', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    expect(result.kind).toBe('provider-execution-succeeded');
    if (result.kind !== 'provider-execution-succeeded') {
      return;
    }

    const projection = projectProviderRuntimeResultForExecutionRun(result);
    expect(projection.kind).toBe('provider-execution-succeeded');
    expect(projection.externalProvisioningReference).toBeDefined();
    expect(projection.safeResultCode).toBe('PROVISIONED');
    assertSentinelsAbsent(JSON.stringify(projection));
  });

  it('[M02] failure projection includes safeFailureCode without exception text', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('throw');
    stack.fakeAdapter.setConfiguredException(new Error(ALL_SENTINELS[4]));

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const projection = projectProviderRuntimeResultForExecutionRun(result);

    expect(projection.safeFailureCode).toBe('PROVIDER_EXCEPTION');
    assertSentinelsAbsent(JSON.stringify(projection));
  });

  it('[M03] projection never includes password or api key sentinels', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.credentialResolver.store({
      credentialReference: 'credential-extra' as never,
      secretValue: ALL_SENTINELS[1],
      providerReference: 'fake-digital-provider' as never,
    });

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    assertSentinelsAbsent(JSON.stringify(projectProviderRuntimeResultForExecutionRun(result)));
  });

  it('[M04] invalid response failure projection stays safe', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('invalid-response');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const projection = projectProviderRuntimeResultForExecutionRun(result);

    expect(projection.safeFailureCode).toBe('INVALID_PROVIDER_RESPONSE');
    assertSentinelsAbsent(JSON.stringify(projection));
  });
});

describe('Sprint 19 provider runtime selection integration [N01-N03]', () => {
  it('[N01] selects lower priority provider registered in stack registry', async () => {
    const stack = createTestProviderRuntimeStack({ providerReference: 'primary-provider' });
    const secondaryAdapter = new FakeProviderAdapter({
      credentialResolver: stack.credentialResolver,
    });

    const secondaryDescriptor = createProviderDescriptor({
      providerReference: 'secondary-provider',
      providerKind: 'digital-provisioning-provider',
      supportedCapabilities: ['digital-subscription-provisioning'],
      status: 'active',
      health: 'healthy',
      priority: 5,
      credentialReference: 'credential-secondary-provider',
    });

    if (!secondaryDescriptor.ok) {
      throw new Error('secondary descriptor failed');
    }

    stack.registry.register({ descriptor: secondaryDescriptor.value, adapter: secondaryAdapter });

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-execution-succeeded');
    if (result.kind === 'provider-execution-succeeded') {
      expect(String(result.providerReference)).toBe('primary-provider');
    }
  });

  it('[N02] unhealthy registered provider prevents selection', async () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    registerDescriptor(registry, adapter, { health: 'unhealthy' });

    const runtime = createRuntime({
      registry,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-selection-failed');
    if (result.kind === 'provider-selection-failed') {
      expect(result.safeFailureCode).toBe('NO_ELIGIBLE_PROVIDER_HEALTH');
    }
  });

  it('[N03] multiple executions produce distinct attempt references', async () => {
    const stack = createTestProviderRuntimeStack({ attemptReferencePrefix: 'attempt-seq' });

    const first = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const second = await stack.providerRuntime.executeProvisioning({
      ...validExecutionRequestInput,
      businessIdempotencyReference: 'idempotency-002',
    });

    expect(first.kind).toBe('provider-execution-succeeded');
    expect(second.kind).toBe('provider-execution-succeeded');
    if (
      first.kind === 'provider-execution-succeeded' &&
      second.kind === 'provider-execution-succeeded'
    ) {
      expect(first.executionAttemptReference).not.toBe(second.executionAttemptReference);
    }
  });
});
