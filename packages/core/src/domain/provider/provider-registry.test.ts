import { describe, expect, it } from 'vitest';

import type { Provider } from './provider.js';
import type { ProviderFactory } from './provider-factory.js';
import type { ProviderConfiguration } from './provider-configuration.js';
import type { ProviderCapabilities, ProviderCapability } from './provider-capability.js';
import type { ProviderRequest } from './provider-request.js';
import type { ProviderResult } from './provider-result.js';
import type { ProviderHealthStatus } from './provider-health-status.js';
import { ProviderRegistry } from './provider-registry.js';
import { ProviderResult as ProviderResultFactory } from './provider-result.js';
import { ProviderError } from './provider-error.js';

type StubExecuteHandler = (
  request: ProviderRequest,
) => Promise<ProviderResult<Readonly<Record<string, unknown>>>>;

const createStubProvider = (params: {
  id: string;
  name: string;
  providerType: string;
  configuration: ProviderConfiguration;
  capabilities: ProviderCapabilities;
  executeHandler?: StubExecuteHandler;
  healthy?: boolean;
}): Provider => ({
  id: params.id,
  name: params.name,
  providerType: params.providerType,
  configuration: params.configuration,
  capabilities: params.capabilities,
  supports(capability: ProviderCapability) {
    return params.capabilities.includes(capability);
  },
  async execute(request) {
    if (!this.supports(request.capability)) {
      return ProviderResultFactory.fail(
        new ProviderError(
          'PROVIDER_CAPABILITY_UNSUPPORTED',
          `Capability "${request.capability}" is not supported.`,
          params.id,
          request.capability,
        ),
      );
    }

    if (params.executeHandler !== undefined) {
      return params.executeHandler(request);
    }

    return ProviderResultFactory.ok({
      capability: request.capability,
      providerId: params.id,
      data: { ok: true },
    });
  },
  async checkHealth() {
    return {
      providerId: params.id,
      healthy: params.healthy ?? true,
      checkedAt: new Date('2026-01-01T00:00:00.000Z'),
    } satisfies ProviderHealthStatus;
  },
});

const createConfiguration = (providerId: string, providerType: string): ProviderConfiguration => ({
  providerId,
  providerType,
  settings: { mode: 'test' },
});

describe('ProviderRegistry', () => {
  it('registers and retrieves multiple providers', () => {
    const registry = new ProviderRegistry();
    const first = createStubProvider({
      id: 'provider-1',
      name: 'Provider One',
      providerType: 'generic',
      configuration: createConfiguration('provider-1', 'generic'),
      capabilities: ['CreateAccount', 'HealthCheck'],
    });
    const second = createStubProvider({
      id: 'provider-2',
      name: 'Provider Two',
      providerType: 'generic',
      configuration: createConfiguration('provider-2', 'generic'),
      capabilities: ['SuspendAccount'],
    });

    registry.registerProvider(first);
    registry.registerProvider(second);

    expect(registry.listProviders()).toHaveLength(2);
    expect(registry.getProvider('provider-1')?.name).toBe('Provider One');
    expect(registry.getProvider('provider-2')?.name).toBe('Provider Two');
  });

  it('lists providers by capability', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(
      createStubProvider({
        id: 'provider-1',
        name: 'Provider One',
        providerType: 'generic',
        configuration: createConfiguration('provider-1', 'generic'),
        capabilities: ['CreateAccount', 'ValidateCredentials'],
      }),
    );
    registry.registerProvider(
      createStubProvider({
        id: 'provider-2',
        name: 'Provider Two',
        providerType: 'generic',
        configuration: createConfiguration('provider-2', 'generic'),
        capabilities: ['ValidateCredentials'],
      }),
    );

    const validators = registry.listByCapability('ValidateCredentials');

    expect(validators).toHaveLength(2);
    expect(validators.map((provider) => provider.id)).toEqual(['provider-1', 'provider-2']);
  });

  it('creates providers from registered factories', () => {
    const factory: ProviderFactory = {
      providerType: 'generic',
      create(configuration) {
        return createStubProvider({
          id: configuration.providerId,
          name: 'Factory Provider',
          providerType: configuration.providerType,
          configuration,
          capabilities: ['HealthCheck'],
        });
      },
    };
    const registry = new ProviderRegistry([factory]);

    const provider = registry.createProvider(createConfiguration('provider-1', 'generic'));

    expect(provider.id).toBe('provider-1');
    expect(registry.getProvider('provider-1')).toBe(provider);
    expect(registry.hasFactory('generic')).toBe(true);
  });

  it('throws when creating a provider without a registered factory', () => {
    const registry = new ProviderRegistry();

    expect(() =>
      registry.createProvider(createConfiguration('provider-1', 'missing-type')),
    ).toThrow(ProviderError);
  });
});

describe('Provider contract', () => {
  it('executes supported capabilities and returns a typed result', async () => {
    const provider = createStubProvider({
      id: 'provider-1',
      name: 'Provider One',
      providerType: 'generic',
      configuration: createConfiguration('provider-1', 'generic'),
      capabilities: ['CreateAccount'],
      async executeHandler(request) {
        return ProviderResultFactory.ok({
          capability: request.capability,
          providerId: 'provider-1',
          data: { accountId: 'account-123' },
        });
      },
    });

    const result = await provider.execute({
      capability: 'CreateAccount',
      payload: { username: 'user-1' },
    });

    expect(ProviderResultFactory.isOk(result)).toBe(true);

    if (ProviderResultFactory.isOk(result)) {
      expect(result.value.data.accountId).toBe('account-123');
    }
  });

  it('rejects unsupported capabilities', async () => {
    const provider = createStubProvider({
      id: 'provider-1',
      name: 'Provider One',
      providerType: 'generic',
      configuration: createConfiguration('provider-1', 'generic'),
      capabilities: ['HealthCheck'],
    });

    const result = await provider.execute({
      capability: 'DeleteAccount',
      payload: {},
    });

    expect(ProviderResultFactory.isFail(result)).toBe(true);
  });

  it('reports provider health status', async () => {
    const provider = createStubProvider({
      id: 'provider-1',
      name: 'Provider One',
      providerType: 'generic',
      configuration: createConfiguration('provider-1', 'generic'),
      capabilities: ['HealthCheck'],
      healthy: false,
    });

    const health = await provider.checkHealth();

    expect(health.providerId).toBe('provider-1');
    expect(health.healthy).toBe(false);
    expect(health.checkedAt).toBeInstanceOf(Date);
  });

  it('supports all required capability names', () => {
    const capabilities: ProviderCapabilities = [
      'CreateAccount',
      'SuspendAccount',
      'DeleteAccount',
      'RenewSubscription',
      'ChangePackage',
      'ResetPassword',
      'ValidateCredentials',
      'HealthCheck',
    ];

    const provider = createStubProvider({
      id: 'provider-1',
      name: 'Provider One',
      providerType: 'generic',
      configuration: createConfiguration('provider-1', 'generic'),
      capabilities,
    });

    for (const capability of capabilities) {
      expect(provider.supports(capability)).toBe(true);
    }
  });
});
