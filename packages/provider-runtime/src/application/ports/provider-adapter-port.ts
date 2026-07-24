import type { ProviderCapability } from '../../domain/provider-capability.js';
import type { ProvisioningParameters } from '../../domain/provisioning-parameters.js';
import type {
  BusinessIdempotencyReference,
  CorrelationReference,
  ExecutionRunReference,
  ExternalOrderReference,
  FulfillmentDefinitionReference,
  InventoryItemReference,
  ReservationReference,
} from '../../domain/provider-references.js';
import type { ReservedQuantity } from '../../domain/reserved-quantity.js';
import type { ProviderExecutionContext } from '../provider-execution-context.js';

export type ProviderExecutionRequest = {
  readonly executionRunReference: ExecutionRunReference;
  readonly externalOrderReference: ExternalOrderReference;
  readonly reservationReference: ReservationReference;
  readonly inventoryItemReference: InventoryItemReference;
  readonly requiredCapability: ProviderCapability;
  readonly quantity: ReservedQuantity;
  readonly fulfillmentDefinitionReference: FulfillmentDefinitionReference;
  readonly provisioningParameters: ProvisioningParameters;
  readonly businessIdempotencyReference: BusinessIdempotencyReference;
  readonly correlationReference?: CorrelationReference;
};

export type ProviderAdapter = {
  execute(
    request: ProviderExecutionRequest,
    context: ProviderExecutionContext,
  ): Promise<ProviderAdapterResult>;
};

export type ProviderAdapterSuccess = {
  readonly kind: 'provider-adapter-succeeded';
  readonly externalProvisioningReference: string;
  readonly deliveryMaterialReference?: string;
  readonly safeResultCode: string;
  readonly safeEvidence?: Readonly<Record<string, string>>;
  readonly completedAt?: Date;
};

export type ProviderAdapterFailure =
  | {
      readonly kind: 'provider-adapter-rejected';
      readonly safeResultCode: string;
    }
  | {
      readonly kind: 'provider-adapter-unavailable';
      readonly safeResultCode: string;
    }
  | {
      readonly kind: 'credential-resolution-failed';
      readonly safeResultCode: string;
    }
  | {
      readonly kind: 'provider-adapter-invalid-response';
      readonly safeResultCode: string;
    };

export type ProviderAdapterResult = ProviderAdapterSuccess | ProviderAdapterFailure;
