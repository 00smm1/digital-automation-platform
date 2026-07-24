import type { ProviderCapability } from './provider-capability.js';
import type {
  BusinessIdempotencyReference,
  ExternalProvisioningReference,
  ProviderExecutionAttemptReference,
  ProviderReference,
} from './provider-references.js';
import type {
  RetryClassification,
  RemoteOutcomeClassification,
  TimeoutClassification,
} from './retry-classification.js';
import { cloneDate } from '../shared/clock.js';

export type ProviderExecutionEvidence = {
  readonly providerReference?: ProviderReference;
  readonly executionAttemptReference?: ProviderExecutionAttemptReference;
  readonly capability?: ProviderCapability;
  readonly businessIdempotencyReference?: BusinessIdempotencyReference;
  readonly externalProvisioningReference?: ExternalProvisioningReference;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly timeoutClassification?: TimeoutClassification;
  readonly remoteOutcomeClassification?: RemoteOutcomeClassification;
  readonly safeResultCode?: string;
  readonly retryClassification: RetryClassification;
};

export const createProviderExecutionEvidence = (
  evidence: ProviderExecutionEvidence,
): ProviderExecutionEvidence => ({
  providerReference: evidence.providerReference,
  executionAttemptReference: evidence.executionAttemptReference,
  capability: evidence.capability,
  businessIdempotencyReference: evidence.businessIdempotencyReference,
  externalProvisioningReference: evidence.externalProvisioningReference,
  startedAt: evidence.startedAt === undefined ? undefined : cloneDate(evidence.startedAt),
  completedAt: evidence.completedAt === undefined ? undefined : cloneDate(evidence.completedAt),
  failedAt: evidence.failedAt === undefined ? undefined : cloneDate(evidence.failedAt),
  timeoutClassification: evidence.timeoutClassification,
  remoteOutcomeClassification: evidence.remoteOutcomeClassification,
  safeResultCode: evidence.safeResultCode,
  retryClassification: evidence.retryClassification,
});

export const projectProviderExecutionEvidenceForAudit = (
  evidence: ProviderExecutionEvidence,
): Readonly<Record<string, string>> => {
  const projection: Record<string, string> = {
    retryClassification: evidence.retryClassification,
  };

  if (evidence.providerReference !== undefined) {
    projection.providerReference = String(evidence.providerReference);
  }

  if (evidence.executionAttemptReference !== undefined) {
    projection.executionAttemptReference = String(evidence.executionAttemptReference);
  }

  if (evidence.capability !== undefined) {
    projection.capability = evidence.capability;
  }

  if (evidence.businessIdempotencyReference !== undefined) {
    projection.businessIdempotencyReference = String(evidence.businessIdempotencyReference);
  }

  if (evidence.externalProvisioningReference !== undefined) {
    projection.externalProvisioningReference = String(evidence.externalProvisioningReference);
  }

  if (evidence.startedAt !== undefined) {
    projection.startedAt = evidence.startedAt.toISOString();
  }

  if (evidence.completedAt !== undefined) {
    projection.completedAt = evidence.completedAt.toISOString();
  }

  if (evidence.failedAt !== undefined) {
    projection.failedAt = evidence.failedAt.toISOString();
  }

  if (evidence.timeoutClassification !== undefined) {
    projection.timeoutClassification = evidence.timeoutClassification;
  }

  if (evidence.remoteOutcomeClassification !== undefined) {
    projection.remoteOutcomeClassification = evidence.remoteOutcomeClassification;
  }

  if (evidence.safeResultCode !== undefined) {
    projection.safeResultCode = evidence.safeResultCode;
  }

  return projection;
};
