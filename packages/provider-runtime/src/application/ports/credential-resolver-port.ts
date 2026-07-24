import type { CredentialReference, ProviderReference } from '../../domain/provider-references.js';

export type ProviderSecret = {
  readonly value: string;
};

export type CredentialResolutionOutcome =
  | { readonly kind: 'credential-resolved'; readonly secret: ProviderSecret }
  | { readonly kind: 'credential-not-found'; readonly safeCode: 'CREDENTIAL_NOT_FOUND' }
  | { readonly kind: 'credential-access-denied'; readonly safeCode: 'CREDENTIAL_ACCESS_DENIED' }
  | {
      readonly kind: 'credential-resolution-failed';
      readonly safeCode: 'CREDENTIAL_RESOLUTION_FAILED';
    };

export type CredentialResolverPort = {
  resolve(params: {
    readonly credentialReference: CredentialReference;
    readonly providerReference: ProviderReference;
  }): Promise<CredentialResolutionOutcome>;
};

export const cloneProviderSecret = (secret: ProviderSecret): ProviderSecret => ({
  value: secret.value,
});
