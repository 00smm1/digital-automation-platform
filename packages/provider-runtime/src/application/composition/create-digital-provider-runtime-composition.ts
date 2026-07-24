import { FakeClock, type Clock } from '../../shared/clock.js';
import { createProviderTimeoutPolicy } from '../provider-timeout-policy.js';
import { ProviderSelectionPolicy } from '../provider-selection-policy.js';
import { ProviderRuntime } from '../provider-runtime.js';
import { createCompositionProviderExecutionAttemptReferenceFactory } from '../composition/create-composition-provider-execution-attempt-reference-factory.js';
import { InMemoryProviderRegistry } from '../../infrastructure/in-memory-provider-registry.js';
import { TimerTimeoutExecutor } from '../../infrastructure/timer-timeout-executor.js';
import { InMemoryCredentialResolver } from '../../infrastructure/in-memory-credential-resolver.js';
import type { ProviderRuntimePort } from '../ports/provider-runtime-port.js';
import type { ProviderRegistry } from '../ports/provider-registry-port.js';
import type { CredentialResolverPort } from '../ports/credential-resolver-port.js';

export type DigitalProviderRuntimeComposition = {
  readonly clock: Clock;
  readonly registry: ProviderRegistry;
  readonly credentialResolver: CredentialResolverPort;
  readonly providerRuntime: ProviderRuntimePort;
};

export type CreateDigitalProviderRuntimeCompositionOptions = {
  readonly clock?: Clock;
  readonly defaultTimeoutMilliseconds?: number;
};

/**
 * Production composition wires provider-neutral runtime infrastructure only.
 * Provider adapters must be registered on `registry` by the hosting composition root.
 */
export const createDigitalProviderRuntimeComposition = (
  options: CreateDigitalProviderRuntimeCompositionOptions = {},
): DigitalProviderRuntimeComposition => {
  const clock = options.clock ?? new FakeClock();
  const registry = new InMemoryProviderRegistry();
  const credentialResolver = new InMemoryCredentialResolver();

  const timeoutPolicyResult = createProviderTimeoutPolicy({
    defaultTimeoutMilliseconds: options.defaultTimeoutMilliseconds ?? 30_000,
  });

  if (!timeoutPolicyResult.ok) {
    throw new Error('Failed to create provider timeout policy for composition.');
  }

  const providerRuntime = new ProviderRuntime({
    registry,
    selectionPolicy: new ProviderSelectionPolicy(),
    attemptReferenceFactory: createCompositionProviderExecutionAttemptReferenceFactory(),
    clock,
    timeoutPolicy: timeoutPolicyResult.value,
    timeoutExecutor: new TimerTimeoutExecutor(),
  });

  return {
    clock,
    registry,
    credentialResolver,
    providerRuntime,
  };
};
