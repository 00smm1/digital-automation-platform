import type { ProviderCapability } from './provider-capability.js';

export type ProviderRequestPayload = Readonly<Record<string, unknown>>;

/**
 * Capability-oriented request sent to a provider.
 */
export type ProviderRequest<TPayload extends ProviderRequestPayload = ProviderRequestPayload> = {
  readonly capability: ProviderCapability;
  readonly payload: TPayload;
  readonly metadata?: Readonly<Record<string, unknown>>;
};
