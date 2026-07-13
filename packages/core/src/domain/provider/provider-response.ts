import type { ProviderCapability } from './provider-capability.js';

export type ProviderResponseData = Readonly<Record<string, unknown>>;

/**
 * Normalized provider response payload.
 */
export type ProviderResponse<TData extends ProviderResponseData = ProviderResponseData> = {
  readonly capability: ProviderCapability;
  readonly providerId: string;
  readonly data: TData;
  readonly metadata?: Readonly<Record<string, unknown>>;
};
