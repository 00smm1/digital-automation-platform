export const PROVIDER_CAPABILITIES = [
  'CreateAccount',
  'SuspendAccount',
  'DeleteAccount',
  'RenewSubscription',
  'ChangePackage',
  'ResetPassword',
  'ValidateCredentials',
  'HealthCheck',
] as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export type ProviderCapabilities = readonly ProviderCapability[];

export const isProviderCapability = (value: string): value is ProviderCapability => {
  return (PROVIDER_CAPABILITIES as readonly string[]).includes(value);
};
