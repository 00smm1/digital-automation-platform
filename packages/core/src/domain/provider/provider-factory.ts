import type { Provider } from './provider.js';
import type { ProviderConfiguration } from './provider-configuration.js';

/**
 * Creates provider instances from configuration.
 */
export interface ProviderFactory {
  readonly providerType: string;

  create(configuration: ProviderConfiguration): Provider;
}
