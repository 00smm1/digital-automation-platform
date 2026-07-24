import { randomUUID } from 'node:crypto';

import { FakeClock } from '../shared/clock.js';
import { createProviderDescriptor } from '../domain/provider-descriptor.js';
import { createProviderTimeoutPolicy } from '../application/provider-timeout-policy.js';
import { ProviderSelectionPolicy } from '../application/provider-selection-policy.js';
import {
  DeterministicProviderExecutionAttemptReferenceFactory,
  type ProviderExecutionAttemptReferenceFactory,
} from '../application/provider-execution-attempt-reference-factory.js';
import { ProviderRuntime } from '../application/provider-runtime.js';
import { InMemoryProviderRegistry } from '../infrastructure/in-memory-provider-registry.js';
import { InMemoryCredentialResolver } from '../infrastructure/in-memory-credential-resolver.js';
import {
  createDeterministicTimeoutExecutor,
  DeterministicTimeoutExecutor,
} from './deterministic-timeout-executor.js';
import { FakeProviderAdapter, SENTINEL_FAKE_PROVIDER_SECRET } from './fake-provider-adapter.js';
import type { ProviderRuntimePort } from '../application/ports/provider-runtime-port.js';
import type { ProviderRegistry } from '../application/ports/provider-registry-port.js';

export type TestProviderRuntimeStack = {
  readonly clock: FakeClock;
  readonly registry: ProviderRegistry;
  readonly providerRuntime: ProviderRuntimePort;
  readonly fakeAdapter: FakeProviderAdapter;
  readonly credentialResolver: InMemoryCredentialResolver;
  readonly timeoutExecutor: DeterministicTimeoutExecutor;
  readonly attemptReferenceFactory: ProviderExecutionAttemptReferenceFactory;
};

export type CreateTestProviderRuntimeStackOptions = {
  readonly clock?: FakeClock;
  readonly providerReference?: string;
  readonly attemptReferencePrefix?: string;
  readonly defaultTimeoutMilliseconds?: number;
};

export const createTestProviderRuntimeStack = (
  options: CreateTestProviderRuntimeStackOptions = {},
): TestProviderRuntimeStack => {
  const clock = options.clock ?? new FakeClock();
  const registry = new InMemoryProviderRegistry();
  const credentialResolver = new InMemoryCredentialResolver();
  const fakeAdapter = new FakeProviderAdapter({ credentialResolver });
  const timeoutExecutor = createDeterministicTimeoutExecutor();
  const attemptReferenceFactory = new DeterministicProviderExecutionAttemptReferenceFactory(
    options.attemptReferencePrefix ?? 'attempt',
  );

  const providerReference = options.providerReference ?? 'fake-digital-provider';
  const credentialReference = `credential-${providerReference}`;

  credentialResolver.store({
    credentialReference:
      credentialReference as import('../domain/provider-references.js').CredentialReference,
    secretValue: SENTINEL_FAKE_PROVIDER_SECRET,
    providerReference:
      providerReference as import('../domain/provider-references.js').ProviderReference,
  });

  const descriptorResult = createProviderDescriptor({
    providerReference,
    providerKind: 'digital-provisioning-provider',
    supportedCapabilities: ['digital-subscription-provisioning'],
    status: 'active',
    health: 'healthy',
    priority: 0,
    credentialReference,
  });

  if (!descriptorResult.ok) {
    throw new Error('Failed to create test provider descriptor.');
  }

  registry.register({
    descriptor: descriptorResult.value,
    adapter: fakeAdapter,
  });

  const timeoutPolicyResult = createProviderTimeoutPolicy({
    defaultTimeoutMilliseconds: options.defaultTimeoutMilliseconds ?? 30_000,
  });

  if (!timeoutPolicyResult.ok) {
    throw new Error('Failed to create test timeout policy.');
  }

  const providerRuntime = new ProviderRuntime({
    registry,
    selectionPolicy: new ProviderSelectionPolicy(),
    attemptReferenceFactory,
    clock,
    timeoutPolicy: timeoutPolicyResult.value,
    timeoutExecutor,
  });

  return {
    clock,
    registry,
    providerRuntime,
    fakeAdapter,
    credentialResolver,
    timeoutExecutor,
    attemptReferenceFactory,
  };
};

export const createCompositionProviderExecutionAttemptReferenceFactoryFromUuid =
  (): ProviderExecutionAttemptReferenceFactory => {
    return {
      create() {
        return `attempt-${randomUUID()}` as import('../domain/provider-references.js').ProviderExecutionAttemptReference;
      },
    };
  };
