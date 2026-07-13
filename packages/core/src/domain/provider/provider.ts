import type { ProviderCapabilities, ProviderCapability } from './provider-capability.js';
import type { ProviderConfiguration } from './provider-configuration.js';
import type { ProviderHealthStatus } from './provider-health-status.js';
import type { ProviderRequest } from './provider-request.js';
import type { ProviderResponseData } from './provider-response.js';
import type { ProviderResult } from './provider-result.js';

/**
 * Contract for external service adapters without transport concerns.
 */
export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly providerType: string;
  readonly capabilities: ProviderCapabilities;
  readonly configuration: ProviderConfiguration;

  supports(capability: ProviderCapability): boolean;

  execute<TData extends ProviderResponseData = ProviderResponseData>(
    request: ProviderRequest,
  ): Promise<ProviderResult<TData>>;

  checkHealth(): Promise<ProviderHealthStatus>;
}
