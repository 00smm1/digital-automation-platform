import type { ProviderDescriptor } from '../../domain/provider-descriptor.js';
import type { ProviderCapability } from '../../domain/provider-capability.js';
import type { ProviderReference } from '../../domain/provider-references.js';
import type { ProviderAdapter } from './provider-adapter-port.js';

export type ProviderRegistrationOutcome =
  | { readonly kind: 'provider-registered'; readonly descriptor: ProviderDescriptor }
  | { readonly kind: 'provider-reference-conflict'; readonly providerReference: ProviderReference }
  | { readonly kind: 'invalid-provider-descriptor'; readonly reasonCode: string }
  | { readonly kind: 'registry-failed'; readonly safeCode: 'PROVIDER_REGISTRY_FAILED' };

export type ProviderRegistry = {
  register(params: {
    readonly descriptor: ProviderDescriptor;
    readonly adapter: ProviderAdapter;
  }): ProviderRegistrationOutcome;

  findDescriptorByReference(providerReference: ProviderReference): ProviderDescriptor | undefined;

  listDescriptorsByCapability(capability: ProviderCapability): readonly ProviderDescriptor[];

  listAllDescriptors(): readonly ProviderDescriptor[];

  resolveAdapter(providerReference: ProviderReference): ProviderAdapter | undefined;
};
