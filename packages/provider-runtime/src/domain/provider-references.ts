import {
  createIdentifier,
  parseNonEmptyReference,
  type Identifier,
} from '../shared/reference-validation.js';
import { Result } from '../shared/result.js';

export type ProviderReference = Identifier<'ProviderReference'>;
export type ProviderExecutionAttemptReference = Identifier<'ProviderExecutionAttemptReference'>;
export type CredentialReference = Identifier<'CredentialReference'>;
export type ExternalProvisioningReference = Identifier<'ExternalProvisioningReference'>;
export type DeliveryMaterialReference = Identifier<'DeliveryMaterialReference'>;
export type BusinessIdempotencyReference = Identifier<'BusinessIdempotencyReference'>;
export type ExecutionRunReference = Identifier<'ExecutionRunReference'>;
export type ExternalOrderReference = Identifier<'ExternalOrderReference'>;
export type ReservationReference = Identifier<'ReservationReference'>;
export type InventoryItemReference = Identifier<'InventoryItemReference'>;
export type FulfillmentDefinitionReference = Identifier<'FulfillmentDefinitionReference'>;
export type CorrelationReference = Identifier<'CorrelationReference'>;
export type PlanReference = Identifier<'PlanReference'>;
export type DurationReference = Identifier<'DurationReference'>;

export type ProviderReferenceValidationError =
  import('../shared/reference-validation.js').ReferenceValidationError;

export const createProviderReference = (value: string): ProviderReference =>
  createIdentifier('ProviderReference', value);

export const parseProviderReference = (value: unknown) =>
  parseNonEmptyReference('ProviderReference', value);

export const parseProviderExecutionAttemptReference = (value: unknown) =>
  parseNonEmptyReference('ProviderExecutionAttemptReference', value);

export const parseCredentialReference = (value: unknown) =>
  parseNonEmptyReference('CredentialReference', value);

export const parseExternalProvisioningReference = (value: unknown) =>
  parseNonEmptyReference('ExternalProvisioningReference', value);

export const parseDeliveryMaterialReference = (value: unknown) =>
  parseNonEmptyReference('DeliveryMaterialReference', value);

export const parseBusinessIdempotencyReference = (value: unknown) =>
  parseNonEmptyReference('BusinessIdempotencyReference', value);

export const parseExecutionRunReference = (value: unknown) =>
  parseNonEmptyReference('ExecutionRunReference', value);

export const parseExternalOrderReference = (value: unknown) =>
  parseNonEmptyReference('ExternalOrderReference', value);

export const parseReservationReference = (value: unknown) =>
  parseNonEmptyReference('ReservationReference', value);

export const parseInventoryItemReference = (value: unknown) =>
  parseNonEmptyReference('InventoryItemReference', value);

export const parseFulfillmentDefinitionReference = (value: unknown) =>
  parseNonEmptyReference('FulfillmentDefinitionReference', value);

export const parseCorrelationReference = (value: unknown) =>
  parseNonEmptyReference('CorrelationReference', value);

export const parsePlanReference = (value: unknown) =>
  parseNonEmptyReference('PlanReference', value);

export const parseDurationReference = (value: unknown) =>
  parseNonEmptyReference('DurationReference', value);

export const createBusinessIdempotencyReferenceFromExecutionRun = (
  executionRunReference: ExecutionRunReference,
): BusinessIdempotencyReference =>
  createIdentifier('BusinessIdempotencyReference', executionRunReference);

export const toReferenceString = (reference: Identifier<string>): string => String(reference);

export type ReferenceParseResult<T> = Result<T, ProviderReferenceValidationError>;
