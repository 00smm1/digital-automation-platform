import {
  cloneProviderSecret,
  type CredentialResolutionOutcome,
  type CredentialResolverPort,
  type ProviderSecret,
} from '../application/ports/credential-resolver-port.js';
import {
  parseCredentialReference,
  type CredentialReference,
  type ProviderReference,
} from '../domain/provider-references.js';

type StoredCredential = {
  readonly secret: ProviderSecret;
  readonly providerReference?: ProviderReference;
};

export class InMemoryCredentialResolver implements CredentialResolverPort {
  private readonly credentials = new Map<string, StoredCredential>();

  store(params: {
    readonly credentialReference: CredentialReference;
    readonly secretValue: string;
    readonly providerReference?: ProviderReference;
  }): void {
    this.credentials.set(String(params.credentialReference), {
      secret: { value: params.secretValue },
      providerReference: params.providerReference,
    });
  }

  async resolve(params: {
    readonly credentialReference: CredentialReference;
    readonly providerReference: ProviderReference;
  }): Promise<CredentialResolutionOutcome> {
    try {
      const stored = this.credentials.get(String(params.credentialReference));

      if (stored === undefined) {
        return { kind: 'credential-not-found', safeCode: 'CREDENTIAL_NOT_FOUND' };
      }

      if (
        stored.providerReference !== undefined &&
        String(stored.providerReference) !== String(params.providerReference)
      ) {
        return { kind: 'credential-access-denied', safeCode: 'CREDENTIAL_ACCESS_DENIED' };
      }

      return {
        kind: 'credential-resolved',
        secret: cloneProviderSecret(stored.secret),
      };
    } catch {
      return { kind: 'credential-resolution-failed', safeCode: 'CREDENTIAL_RESOLUTION_FAILED' };
    }
  }
}

export const createCredentialReference = (value: string): CredentialReference | undefined => {
  const parsed = parseCredentialReference(value);
  return parsed.ok ? parsed.value : undefined;
};
