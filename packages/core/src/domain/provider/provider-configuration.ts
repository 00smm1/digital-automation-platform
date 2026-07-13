/**
 * Provider-specific configuration supplied through dependency injection.
 */
export type ProviderConfiguration = {
  readonly providerId: string;
  readonly providerType: string;
  readonly settings: Readonly<Record<string, unknown>>;
};
