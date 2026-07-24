import { createIdentifier } from '../shared/reference-validation.js';
import type { ExternalProvisioningReference } from '../domain/provider-references.js';
import type {
  CredentialResolverPort,
  ProviderSecret,
} from '../application/ports/credential-resolver-port.js';
import type {
  ProviderAdapter,
  ProviderAdapterResult,
  ProviderExecutionRequest,
} from '../application/ports/provider-adapter-port.js';
import type { ProviderExecutionContext } from '../application/provider-execution-context.js';
import type { ProviderCapability } from '../domain/provider-capability.js';

export type FakeProviderAdapterMode =
  | 'success'
  | 'rejected'
  | 'unavailable'
  | 'throw'
  | 'invalid-response'
  | 'pending'
  | 'credential-failure';

export type FakeProviderInvocationRecord = {
  readonly providerReference: string;
  readonly executionAttemptReference: string;
  readonly businessIdempotencyReference: string;
  readonly capability: ProviderCapability;
  readonly quantity: number;
  readonly reservationReference: string;
  readonly inventoryItemReference: string;
};

export type FakeProviderAdapterOptions = {
  readonly providerReferencePrefix?: string;
  readonly credentialResolver?: CredentialResolverPort;
};

export class FakeProviderAdapter implements ProviderAdapter {
  private readonly providerReferencePrefix: string;
  private readonly credentialResolver?: CredentialResolverPort;
  private mode: FakeProviderAdapterMode = 'success';
  private invocationCount = 0;
  private readonly invocations: FakeProviderInvocationRecord[] = [];
  private readonly idempotencyStore = new Map<string, ExternalProvisioningReference>();
  private pendingResolvers: Array<(result: ProviderAdapterResult) => void> = [];
  private configuredException = new Error('fake-provider-exception');
  private credentialUsed = false;

  constructor(options: FakeProviderAdapterOptions = {}) {
    this.providerReferencePrefix = options.providerReferencePrefix ?? 'external-provision';
    this.credentialResolver = options.credentialResolver;
  }

  setMode(mode: FakeProviderAdapterMode): void {
    this.mode = mode;
  }

  setConfiguredException(error: Error): void {
    this.configuredException = error;
  }

  resolvePending(result: ProviderAdapterResult): void {
    const resolver = this.pendingResolvers.shift();
    resolver?.(result);
  }

  getInvocationCount(): number {
    return this.invocationCount;
  }

  getInvocations(): readonly FakeProviderInvocationRecord[] {
    return this.invocations.map((record) => ({ ...record }));
  }

  wasCredentialUsed(): boolean {
    return this.credentialUsed;
  }

  reset(): void {
    this.mode = 'success';
    this.invocationCount = 0;
    this.invocations.length = 0;
    this.idempotencyStore.clear();
    this.pendingResolvers = [];
    this.credentialUsed = false;
  }

  async execute(
    request: ProviderExecutionRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderAdapterResult> {
    this.invocationCount += 1;
    this.invocations.push({
      providerReference: String(context.providerReference),
      executionAttemptReference: String(context.executionAttemptReference),
      businessIdempotencyReference: String(request.businessIdempotencyReference),
      capability: request.requiredCapability,
      quantity: request.quantity,
      reservationReference: String(request.reservationReference),
      inventoryItemReference: String(request.inventoryItemReference),
    });

    if (this.mode === 'throw') {
      throw this.configuredException;
    }

    if (this.credentialResolver !== undefined) {
      const credentialOutcome = await this.credentialResolver.resolve({
        credentialReference: context.credentialReference,
        providerReference: context.providerReference,
      });

      if (credentialOutcome.kind !== 'credential-resolved') {
        return {
          kind: 'credential-resolution-failed',
          safeResultCode: 'CREDENTIAL_RESOLUTION_FAILED',
        };
      }

      this.credentialUsed = this.secretWasAccessed(credentialOutcome.secret);
    }

    if (this.mode === 'pending') {
      return new Promise<ProviderAdapterResult>((resolve) => {
        this.pendingResolvers.push(resolve);
      });
    }

    if (this.mode === 'rejected') {
      return { kind: 'provider-adapter-rejected', safeResultCode: 'PROVIDER_REJECTED' };
    }

    if (this.mode === 'unavailable') {
      return { kind: 'provider-adapter-unavailable', safeResultCode: 'PROVIDER_UNAVAILABLE' };
    }

    if (this.mode === 'invalid-response') {
      return {
        kind: 'provider-adapter-succeeded',
        externalProvisioningReference: '',
        safeResultCode: 'INVALID',
      };
    }

    if (this.mode === 'credential-failure') {
      return {
        kind: 'credential-resolution-failed',
        safeResultCode: 'CREDENTIAL_RESOLUTION_FAILED',
      };
    }

    const idempotencyKey = String(request.businessIdempotencyReference);
    const existing = this.idempotencyStore.get(idempotencyKey);
    if (existing !== undefined) {
      return {
        kind: 'provider-adapter-succeeded',
        externalProvisioningReference: String(existing),
        deliveryMaterialReference: `delivery-${String(existing)}`,
        safeResultCode: 'IDEMPOTENT_REPLAY',
      };
    }

    const externalReference = createIdentifier(
      'ExternalProvisioningReference',
      `${this.providerReferencePrefix}-${idempotencyKey}`,
    ) as ExternalProvisioningReference;
    this.idempotencyStore.set(idempotencyKey, externalReference);

    return {
      kind: 'provider-adapter-succeeded',
      externalProvisioningReference: String(externalReference),
      deliveryMaterialReference: `delivery-${String(externalReference)}`,
      safeResultCode: 'PROVISIONED',
    };
  }

  private secretWasAccessed(secret: ProviderSecret): boolean {
    return secret.value.length > 0;
  }
}

export const SENTINEL_FAKE_PROVIDER_SECRET = 'SUPER_SECRET_PROVIDER_API_KEY';
