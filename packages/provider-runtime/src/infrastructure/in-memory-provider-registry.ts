import { cloneProviderDescriptor, type ProviderDescriptor } from '../domain/provider-descriptor.js';
import type { ProviderCapability } from '../domain/provider-capability.js';
import type { ProviderReference } from '../domain/provider-references.js';
import type { ProviderAdapter } from '../application/ports/provider-adapter-port.js';
import type {
  ProviderRegistrationOutcome,
  ProviderRegistry,
} from '../application/ports/provider-registry-port.js';

type RegistryEntry = {
  readonly descriptor: ProviderDescriptor;
  readonly adapter: ProviderAdapter;
};

export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  register(params: {
    readonly descriptor: ProviderDescriptor;
    readonly adapter: ProviderAdapter;
  }): ProviderRegistrationOutcome {
    const key = String(params.descriptor.providerReference);

    if (this.entries.has(key)) {
      return {
        kind: 'provider-reference-conflict',
        providerReference: params.descriptor.providerReference,
      };
    }

    this.entries.set(key, {
      descriptor: cloneProviderDescriptor(params.descriptor),
      adapter: params.adapter,
    });

    return {
      kind: 'provider-registered',
      descriptor: cloneProviderDescriptor(params.descriptor),
    };
  }

  findDescriptorByReference(providerReference: ProviderReference): ProviderDescriptor | undefined {
    const entry = this.entries.get(String(providerReference));
    return entry === undefined ? undefined : cloneProviderDescriptor(entry.descriptor);
  }

  listDescriptorsByCapability(capability: ProviderCapability): readonly ProviderDescriptor[] {
    return [...this.entries.values()]
      .map((entry) => entry.descriptor)
      .filter((descriptor) => descriptor.supportedCapabilities.includes(capability))
      .map(cloneProviderDescriptor);
  }

  listAllDescriptors(): readonly ProviderDescriptor[] {
    return [...this.entries.values()].map((entry) => cloneProviderDescriptor(entry.descriptor));
  }

  resolveAdapter(providerReference: ProviderReference): ProviderAdapter | undefined {
    return this.entries.get(String(providerReference))?.adapter;
  }
}
