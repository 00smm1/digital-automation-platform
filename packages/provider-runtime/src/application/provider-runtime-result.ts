import {
  createProviderExecutionEvidence,
  type ProviderExecutionEvidence,
} from '../domain/provider-execution-evidence.js';
import type { ProviderCapability } from '../domain/provider-capability.js';
import type {
  DeliveryMaterialReference,
  ExternalProvisioningReference,
  ProviderExecutionAttemptReference,
  ProviderReference,
} from '../domain/provider-references.js';
import type {
  RetryClassification,
  RemoteOutcomeClassification,
} from '../domain/retry-classification.js';
import { cloneDate } from '../shared/clock.js';

export type ProviderRuntimeSuccess = {
  readonly kind: 'provider-execution-succeeded';
  readonly providerReference: ProviderReference;
  readonly executionAttemptReference: ProviderExecutionAttemptReference;
  readonly capability: ProviderCapability;
  readonly externalProvisioningReference: ExternalProvisioningReference;
  readonly deliveryMaterialReference?: DeliveryMaterialReference;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly safeResultCode: string;
  readonly remoteOutcomeClassification: 'confirmed-success';
  readonly safeEvidence: ProviderExecutionEvidence;
  readonly retryClassification: 'retry-not-applicable';
};

export type ProviderRuntimeFailure = {
  readonly kind:
    | 'invalid-provider-request'
    | 'provider-selection-failed'
    | 'provider-timeout'
    | 'provider-rejected'
    | 'provider-unavailable'
    | 'provider-exception'
    | 'credential-resolution-failed'
    | 'invalid-provider-response'
    | 'runtime-failed';
  readonly safeFailureCode: string;
  readonly retryClassification: RetryClassification;
  readonly remoteOutcomeClassification?: RemoteOutcomeClassification;
  readonly providerReference?: ProviderReference;
  readonly executionAttemptReference?: ProviderExecutionAttemptReference;
  readonly startedAt?: Date;
  readonly failedAt?: Date;
  readonly safeEvidence?: ProviderExecutionEvidence;
};

export type ProviderRuntimeResult = ProviderRuntimeSuccess | ProviderRuntimeFailure;

export const cloneProviderRuntimeResult = (
  result: ProviderRuntimeResult,
): ProviderRuntimeResult => {
  if (result.kind === 'provider-execution-succeeded') {
    return {
      ...result,
      startedAt: cloneDate(result.startedAt),
      completedAt: cloneDate(result.completedAt),
      safeEvidence: createProviderExecutionEvidence(result.safeEvidence),
    };
  }

  return {
    ...result,
    startedAt: result.startedAt === undefined ? undefined : cloneDate(result.startedAt),
    failedAt: result.failedAt === undefined ? undefined : cloneDate(result.failedAt),
    safeEvidence:
      result.safeEvidence === undefined
        ? undefined
        : createProviderExecutionEvidence(result.safeEvidence),
  };
};

export const projectProviderRuntimeResultForExecutionRun = (
  result: ProviderRuntimeResult,
): Readonly<Record<string, string>> => {
  const projection: Record<string, string> = {
    kind: result.kind,
    retryClassification: result.retryClassification,
  };

  if (result.kind === 'provider-execution-succeeded') {
    projection.providerReference = String(result.providerReference);
    projection.executionAttemptReference = String(result.executionAttemptReference);
    projection.capability = result.capability;
    projection.externalProvisioningReference = String(result.externalProvisioningReference);
    if (result.deliveryMaterialReference !== undefined) {
      projection.deliveryMaterialReference = String(result.deliveryMaterialReference);
    }
    projection.safeResultCode = result.safeResultCode;
    projection.remoteOutcomeClassification = result.remoteOutcomeClassification;
    projection.startedAt = result.startedAt.toISOString();
    projection.completedAt = result.completedAt.toISOString();
    return projection;
  }

  projection.safeFailureCode = result.safeFailureCode;
  if (result.remoteOutcomeClassification !== undefined) {
    projection.remoteOutcomeClassification = result.remoteOutcomeClassification;
  }
  if (result.providerReference !== undefined) {
    projection.providerReference = String(result.providerReference);
  }
  if (result.executionAttemptReference !== undefined) {
    projection.executionAttemptReference = String(result.executionAttemptReference);
  }
  if (result.startedAt !== undefined) {
    projection.startedAt = result.startedAt.toISOString();
  }
  if (result.failedAt !== undefined) {
    projection.failedAt = result.failedAt.toISOString();
  }

  return projection;
};
