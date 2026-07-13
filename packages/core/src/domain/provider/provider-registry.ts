import type { Provider } from './provider.js';
import type { ProviderCapability } from './provider-capability.js';
import type { ProviderConfiguration } from './provider-configuration.js';
import type { ProviderFactory } from './provider-factory.js';
import { ProviderError } from './provider-error.js';

/**
 * Registry for multiple provider instances and factories.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly factories = new Map<string, ProviderFactory>();

  constructor(factories: readonly ProviderFactory[] = []) {
    for (const factory of factories) {
      this.registerFactory(factory);
    }
  }

  registerFactory(factory: ProviderFactory): void {
    this.factories.set(factory.providerType, factory);
  }

  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  getProvider(providerId: string): Provider | null {
    return this.providers.get(providerId) ?? null;
  }

  listProviders(): readonly Provider[] {
    return [...this.providers.values()];
  }

  listByCapability(capability: ProviderCapability): readonly Provider[] {
    return this.listProviders().filter((provider) => provider.supports(capability));
  }

  createProvider(configuration: ProviderConfiguration): Provider {
    const factory = this.factories.get(configuration.providerType);

    if (factory === undefined) {
      throw new ProviderError(
        'PROVIDER_FACTORY_NOT_FOUND',
        `No factory registered for provider type "${configuration.providerType}".`,
        configuration.providerId,
      );
    }

    const provider = factory.create(configuration);
    this.registerProvider(provider);
    return provider;
  }

  hasFactory(providerType: string): boolean {
    return this.factories.has(providerType);
  }
}
