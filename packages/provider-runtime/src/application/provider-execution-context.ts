import {
  parseCredentialReference,
  parseProviderExecutionAttemptReference,
  parseProviderReference,
  type BusinessIdempotencyReference,
  type CredentialReference,
  type ProviderExecutionAttemptReference,
  type ProviderReference,
} from '../domain/provider-references.js';
import { cloneSafeMetadata, type SafeMetadata } from '../domain/safe-metadata.js';
import { cloneDate, type Clock } from '../shared/clock.js';
import { Result } from '../shared/result.js';

export type ProviderExecutionContext = {
  readonly executionAttemptReference: ProviderExecutionAttemptReference;
  readonly providerReference: ProviderReference;
  readonly credentialReference: CredentialReference;
  readonly startedAt: Date;
  readonly timeoutMilliseconds: number;
  readonly timeoutDeadline: Date;
  readonly businessIdempotencyReference: BusinessIdempotencyReference;
  readonly correlationData?: SafeMetadata;
};

export type ProviderExecutionContextInput = {
  readonly executionAttemptReference: unknown;
  readonly providerReference: unknown;
  readonly credentialReference: unknown;
  readonly startedAt: Date;
  readonly timeoutMilliseconds: unknown;
  readonly businessIdempotencyReference: BusinessIdempotencyReference;
  readonly correlationData?: Readonly<Record<string, string>>;
};

export type ProviderExecutionContextValidationError = {
  readonly reasonCode:
    | 'invalid-execution-attempt-reference'
    | 'invalid-provider-reference'
    | 'invalid-credential-reference'
    | 'invalid-timeout-milliseconds';
};

const parseTimeoutMilliseconds = (
  value: unknown,
): Result<number, ProviderExecutionContextValidationError> => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return Result.fail({ reasonCode: 'invalid-timeout-milliseconds' });
  }

  if (value <= 0 || !Number.isSafeInteger(value)) {
    return Result.fail({ reasonCode: 'invalid-timeout-milliseconds' });
  }

  return Result.ok(value);
};

export const createProviderExecutionContext = (
  input: ProviderExecutionContextInput,
): Result<ProviderExecutionContext, ProviderExecutionContextValidationError> => {
  const executionAttemptReferenceResult = parseProviderExecutionAttemptReference(
    input.executionAttemptReference,
  );
  if (!executionAttemptReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-execution-attempt-reference' });
  }

  const providerReferenceResult = parseProviderReference(input.providerReference);
  if (!providerReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provider-reference' });
  }

  const credentialReferenceResult = parseCredentialReference(input.credentialReference);
  if (!credentialReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-credential-reference' });
  }

  const timeoutResult = parseTimeoutMilliseconds(input.timeoutMilliseconds);
  if (!timeoutResult.ok) {
    return Result.fail(timeoutResult.error);
  }

  const startedAt = cloneDate(input.startedAt);
  const timeoutDeadline = new Date(startedAt.getTime() + timeoutResult.value);

  return Result.ok({
    executionAttemptReference:
      executionAttemptReferenceResult.value as ProviderExecutionAttemptReference,
    providerReference: providerReferenceResult.value,
    credentialReference: credentialReferenceResult.value,
    startedAt,
    timeoutMilliseconds: timeoutResult.value,
    timeoutDeadline,
    businessIdempotencyReference: input.businessIdempotencyReference,
    correlationData: cloneSafeMetadata(input.correlationData),
  });
};

export const createProviderExecutionContextFromClock = (params: {
  readonly clock: Clock;
  readonly executionAttemptReference: ProviderExecutionAttemptReference;
  readonly providerReference: ProviderReference;
  readonly credentialReference: CredentialReference;
  readonly timeoutMilliseconds: number;
  readonly businessIdempotencyReference: BusinessIdempotencyReference;
  readonly correlationData?: SafeMetadata;
}): ProviderExecutionContext => {
  const startedAt = params.clock.now();
  return {
    executionAttemptReference: params.executionAttemptReference,
    providerReference: params.providerReference,
    credentialReference: params.credentialReference,
    startedAt: cloneDate(startedAt),
    timeoutMilliseconds: params.timeoutMilliseconds,
    timeoutDeadline: new Date(startedAt.getTime() + params.timeoutMilliseconds),
    businessIdempotencyReference: params.businessIdempotencyReference,
    correlationData:
      params.correlationData === undefined ? undefined : { ...params.correlationData },
  };
};

export const cloneProviderExecutionContext = (
  context: ProviderExecutionContext,
): ProviderExecutionContext => ({
  executionAttemptReference: context.executionAttemptReference,
  providerReference: context.providerReference,
  credentialReference: context.credentialReference,
  startedAt: cloneDate(context.startedAt),
  timeoutMilliseconds: context.timeoutMilliseconds,
  timeoutDeadline: cloneDate(context.timeoutDeadline),
  businessIdempotencyReference: context.businessIdempotencyReference,
  correlationData:
    context.correlationData === undefined ? undefined : { ...context.correlationData },
});
