import { createProviderExecutionEvidence } from '../domain/provider-execution-evidence.js';
import {
  parseDeliveryMaterialReference,
  parseExternalProvisioningReference,
  type DeliveryMaterialReference,
  type ExternalProvisioningReference,
  type ProviderExecutionAttemptReference,
  type ProviderReference,
} from '../domain/provider-references.js';
import type { Clock } from '../shared/clock.js';
import type {
  ProviderAdapterResult,
  ProviderExecutionRequest,
} from './ports/provider-adapter-port.js';
import type { ProviderRegistry } from './ports/provider-registry-port.js';
import type { TimeoutExecutor } from './ports/timeout-executor-port.js';
import {
  cloneProviderExecutionRequest,
  createProviderExecutionRequest,
  type ProviderExecutionRequestInput,
} from './provider-execution-request.js';
import { createProviderExecutionContextFromClock } from './provider-execution-context.js';
import type { ProviderExecutionAttemptReferenceFactory } from './provider-execution-attempt-reference-factory.js';
import { ProviderSelectionPolicy } from './provider-selection-policy.js';
import { createProviderSelectionRequest } from './provider-selection-request.js';
import {
  resolveProviderTimeoutMilliseconds,
  type ProviderTimeoutPolicy,
} from './provider-timeout-policy.js';
import type { ProviderRuntimePort } from './ports/provider-runtime-port.js';
import type { ProviderRuntimeFailure, ProviderRuntimeResult } from './provider-runtime-result.js';

export type ProviderRuntimeDependencies = {
  readonly registry: ProviderRegistry;
  readonly selectionPolicy: ProviderSelectionPolicy;
  readonly attemptReferenceFactory: ProviderExecutionAttemptReferenceFactory;
  readonly clock: Clock;
  readonly timeoutPolicy: ProviderTimeoutPolicy;
  readonly timeoutExecutor: TimeoutExecutor;
};

const createFailure = (failure: ProviderRuntimeFailure): ProviderRuntimeFailure => ({
  ...failure,
  safeEvidence:
    failure.safeEvidence === undefined
      ? undefined
      : createProviderExecutionEvidence(failure.safeEvidence),
});

const mapAdapterFailure = (params: {
  adapterResult: Exclude<ProviderAdapterResult, { kind: 'provider-adapter-succeeded' }>;
  providerReference: ProviderReference;
  executionAttemptReference: ProviderExecutionAttemptReference;
  startedAt: Date;
  failedAt: Date;
  capability: ProviderExecutionRequest['requiredCapability'];
  businessIdempotencyReference: ProviderExecutionRequest['businessIdempotencyReference'];
}): ProviderRuntimeFailure => {
  const evidence = createProviderExecutionEvidence({
    providerReference: params.providerReference,
    executionAttemptReference: params.executionAttemptReference,
    capability: params.capability,
    businessIdempotencyReference: params.businessIdempotencyReference,
    startedAt: params.startedAt,
    failedAt: params.failedAt,
    timeoutClassification: 'not-applicable',
    safeResultCode: params.adapterResult.safeResultCode,
    remoteOutcomeClassification:
      params.adapterResult.kind === 'provider-adapter-rejected' ? 'confirmed-failure' : undefined,
    retryClassification:
      params.adapterResult.kind === 'provider-adapter-rejected'
        ? 'retry-not-safe'
        : params.adapterResult.kind === 'credential-resolution-failed'
          ? 'retry-may-be-safe'
          : 'retry-may-be-safe',
  });

  switch (params.adapterResult.kind) {
    case 'provider-adapter-rejected':
      return createFailure({
        kind: 'provider-rejected',
        safeFailureCode: 'PROVIDER_REJECTED',
        remoteOutcomeClassification: 'confirmed-failure',
        retryClassification: 'retry-not-safe',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
        startedAt: params.startedAt,
        failedAt: params.failedAt,
        safeEvidence: evidence,
      });
    case 'provider-adapter-unavailable':
      return createFailure({
        kind: 'provider-unavailable',
        safeFailureCode: 'PROVIDER_UNAVAILABLE',
        retryClassification: 'retry-may-be-safe',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
        startedAt: params.startedAt,
        failedAt: params.failedAt,
        safeEvidence: evidence,
      });
    case 'credential-resolution-failed':
      return createFailure({
        kind: 'credential-resolution-failed',
        safeFailureCode: 'CREDENTIAL_RESOLUTION_FAILED',
        retryClassification: 'retry-may-be-safe',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
        startedAt: params.startedAt,
        failedAt: params.failedAt,
        safeEvidence: evidence,
      });
    case 'provider-adapter-invalid-response':
      return createFailure({
        kind: 'invalid-provider-response',
        safeFailureCode: 'INVALID_PROVIDER_RESPONSE',
        retryClassification: 'retry-after-reconciliation',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
        startedAt: params.startedAt,
        failedAt: params.failedAt,
        safeEvidence: evidence,
      });
    default: {
      const exhaustive: never = params.adapterResult;
      return exhaustive;
    }
  }
};

const validateAdapterSuccess = (params: {
  adapterResult: Extract<ProviderAdapterResult, { kind: 'provider-adapter-succeeded' }>;
  providerReference: ProviderReference;
  executionAttemptReference: ProviderExecutionAttemptReference;
  requiredCapability: ProviderExecutionRequest['requiredCapability'];
}): Result<
  {
    externalProvisioningReference: ExternalProvisioningReference;
    deliveryMaterialReference?: DeliveryMaterialReference;
  },
  ProviderRuntimeFailure
> => {
  const externalReferenceResult = parseExternalProvisioningReference(
    params.adapterResult.externalProvisioningReference,
  );
  if (!externalReferenceResult.ok) {
    return {
      ok: false,
      error: createFailure({
        kind: 'invalid-provider-response',
        safeFailureCode: 'INVALID_PROVIDER_RESPONSE',
        retryClassification: 'retry-after-reconciliation',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
      }),
    };
  }

  let deliveryMaterialReference: DeliveryMaterialReference | undefined;
  if (params.adapterResult.deliveryMaterialReference !== undefined) {
    const deliveryReferenceResult = parseDeliveryMaterialReference(
      params.adapterResult.deliveryMaterialReference,
    );
    if (!deliveryReferenceResult.ok) {
      return {
        ok: false,
        error: createFailure({
          kind: 'invalid-provider-response',
          safeFailureCode: 'INVALID_PROVIDER_RESPONSE',
          retryClassification: 'retry-after-reconciliation',
          providerReference: params.providerReference,
          executionAttemptReference: params.executionAttemptReference,
        }),
      };
    }
    deliveryMaterialReference = deliveryReferenceResult.value;
  }

  if (
    params.adapterResult.safeEvidence !== undefined &&
    typeof params.adapterResult.safeEvidence.secret === 'string'
  ) {
    return {
      ok: false,
      error: createFailure({
        kind: 'invalid-provider-response',
        safeFailureCode: 'INVALID_PROVIDER_RESPONSE',
        retryClassification: 'retry-after-reconciliation',
        providerReference: params.providerReference,
        executionAttemptReference: params.executionAttemptReference,
      }),
    };
  }

  return {
    ok: true,
    value: {
      externalProvisioningReference: externalReferenceResult.value,
      deliveryMaterialReference,
    },
  };
};

type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export class ProviderRuntime implements ProviderRuntimePort {
  private readonly registry: ProviderRegistry;
  private readonly selectionPolicy: ProviderSelectionPolicy;
  private readonly attemptReferenceFactory: ProviderExecutionAttemptReferenceFactory;
  private readonly clock: Clock;
  private readonly timeoutPolicy: ProviderTimeoutPolicy;
  private readonly timeoutExecutor: TimeoutExecutor;

  constructor(dependencies: ProviderRuntimeDependencies) {
    this.registry = dependencies.registry;
    this.selectionPolicy = dependencies.selectionPolicy;
    this.attemptReferenceFactory = dependencies.attemptReferenceFactory;
    this.clock = dependencies.clock;
    this.timeoutPolicy = dependencies.timeoutPolicy;
    this.timeoutExecutor = dependencies.timeoutExecutor;
  }

  async executeProvisioning(
    requestInput: ProviderExecutionRequestInput,
  ): Promise<ProviderRuntimeResult> {
    const validatedRequestResult = createProviderExecutionRequest(requestInput);
    if (!validatedRequestResult.ok) {
      return createFailure({
        kind: 'invalid-provider-request',
        safeFailureCode: 'INVALID_PROVIDER_REQUEST',
        retryClassification: 'retry-not-safe',
      });
    }

    const request = cloneProviderExecutionRequest(validatedRequestResult.value);

    let descriptors: readonly import('../domain/provider-descriptor.js').ProviderDescriptor[];
    try {
      descriptors = this.registry.listDescriptorsByCapability(request.requiredCapability);
    } catch {
      return createFailure({
        kind: 'provider-selection-failed',
        safeFailureCode: 'PROVIDER_REGISTRY_FAILED',
        retryClassification: 'retry-may-be-safe',
      });
    }

    const selectionRequestResult = createProviderSelectionRequest({
      requiredCapability: request.requiredCapability,
    });

    if (!selectionRequestResult.ok) {
      return createFailure({
        kind: 'provider-selection-failed',
        safeFailureCode: 'INVALID_SELECTION_REQUEST',
        retryClassification: 'retry-not-safe',
      });
    }

    const selectionDecision = this.selectionPolicy.select({
      request: selectionRequestResult.value,
      descriptors,
    });

    if (selectionDecision.kind !== 'provider-selected') {
      return createFailure({
        kind: 'provider-selection-failed',
        safeFailureCode: selectionDecision.safeCode,
        retryClassification: 'retry-may-be-safe',
      });
    }

    const selectedDescriptor = selectionDecision.descriptor;
    let adapter;
    try {
      adapter = this.registry.resolveAdapter(selectedDescriptor.providerReference);
    } catch {
      return createFailure({
        kind: 'runtime-failed',
        safeFailureCode: 'PROVIDER_RUNTIME_FAILED',
        retryClassification: 'retry-may-be-safe',
        providerReference: selectedDescriptor.providerReference,
      });
    }

    if (adapter === undefined) {
      return createFailure({
        kind: 'runtime-failed',
        safeFailureCode: 'PROVIDER_RUNTIME_FAILED',
        retryClassification: 'retry-may-be-safe',
        providerReference: selectedDescriptor.providerReference,
      });
    }

    const executionAttemptReference = this.attemptReferenceFactory.create();
    const timeoutMilliseconds = resolveProviderTimeoutMilliseconds({
      policy: this.timeoutPolicy,
      providerReference: selectedDescriptor.providerReference,
      capability: request.requiredCapability,
    });
    const startedAt = this.clock.now();
    const executionContext = createProviderExecutionContextFromClock({
      clock: this.clock,
      executionAttemptReference,
      providerReference: selectedDescriptor.providerReference,
      credentialReference: selectedDescriptor.credentialReference,
      timeoutMilliseconds,
      businessIdempotencyReference: request.businessIdempotencyReference,
      correlationData:
        request.correlationReference === undefined
          ? undefined
          : { correlationReference: String(request.correlationReference) },
    });

    let adapterResult: ProviderAdapterResult;
    try {
      const timeoutOutcome = await this.timeoutExecutor.execute({
        timeoutMilliseconds,
        operation: () => adapter.execute(request, executionContext),
      });

      if (timeoutOutcome.kind === 'operation-timed-out') {
        const failedAt = this.clock.now();
        return createFailure({
          kind: 'provider-timeout',
          safeFailureCode: 'PROVIDER_TIMEOUT',
          remoteOutcomeClassification: 'unknown',
          retryClassification: 'retry-after-reconciliation',
          providerReference: selectedDescriptor.providerReference,
          executionAttemptReference,
          startedAt,
          failedAt,
          safeEvidence: createProviderExecutionEvidence({
            providerReference: selectedDescriptor.providerReference,
            executionAttemptReference,
            capability: request.requiredCapability,
            businessIdempotencyReference: request.businessIdempotencyReference,
            startedAt,
            failedAt,
            timeoutClassification: 'timed-out',
            remoteOutcomeClassification: 'unknown',
            safeResultCode: 'PROVIDER_TIMEOUT',
            retryClassification: 'retry-after-reconciliation',
          }),
        });
      }

      adapterResult = timeoutOutcome.value;
    } catch {
      const failedAt = this.clock.now();
      return createFailure({
        kind: 'provider-exception',
        safeFailureCode: 'PROVIDER_EXCEPTION',
        retryClassification: 'retry-after-reconciliation',
        providerReference: selectedDescriptor.providerReference,
        executionAttemptReference,
        startedAt,
        failedAt,
        safeEvidence: createProviderExecutionEvidence({
          providerReference: selectedDescriptor.providerReference,
          executionAttemptReference,
          capability: request.requiredCapability,
          businessIdempotencyReference: request.businessIdempotencyReference,
          startedAt,
          failedAt,
          timeoutClassification: 'not-applicable',
          safeResultCode: 'PROVIDER_EXCEPTION',
          retryClassification: 'retry-after-reconciliation',
        }),
      });
    }

    if (adapterResult.kind !== 'provider-adapter-succeeded') {
      return mapAdapterFailure({
        adapterResult,
        providerReference: selectedDescriptor.providerReference,
        executionAttemptReference,
        startedAt,
        failedAt: this.clock.now(),
        capability: request.requiredCapability,
        businessIdempotencyReference: request.businessIdempotencyReference,
      });
    }

    const validatedSuccess = validateAdapterSuccess({
      adapterResult,
      providerReference: selectedDescriptor.providerReference,
      executionAttemptReference,
      requiredCapability: request.requiredCapability,
    });

    if (!validatedSuccess.ok) {
      return {
        ...validatedSuccess.error,
        startedAt,
        failedAt: this.clock.now(),
      };
    }

    const completedAt = this.clock.now();
    return {
      kind: 'provider-execution-succeeded',
      providerReference: selectedDescriptor.providerReference,
      executionAttemptReference,
      capability: request.requiredCapability,
      externalProvisioningReference: validatedSuccess.value.externalProvisioningReference,
      deliveryMaterialReference: validatedSuccess.value.deliveryMaterialReference,
      startedAt,
      completedAt,
      safeResultCode: adapterResult.safeResultCode,
      remoteOutcomeClassification: 'confirmed-success',
      retryClassification: 'retry-not-applicable',
      safeEvidence: createProviderExecutionEvidence({
        providerReference: selectedDescriptor.providerReference,
        executionAttemptReference,
        capability: request.requiredCapability,
        businessIdempotencyReference: request.businessIdempotencyReference,
        externalProvisioningReference: validatedSuccess.value.externalProvisioningReference,
        startedAt,
        completedAt,
        timeoutClassification: 'completed',
        remoteOutcomeClassification: 'confirmed-success',
        safeResultCode: adapterResult.safeResultCode,
        retryClassification: 'retry-not-applicable',
      }),
    };
  }
}
