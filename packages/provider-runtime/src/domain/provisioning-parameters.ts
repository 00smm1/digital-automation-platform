import {
  parseDurationReference,
  parsePlanReference,
  type DurationReference,
  type PlanReference,
} from './provider-references.js';
import { Result } from '../shared/result.js';

export type DigitalSubscriptionProvisioningParameters = {
  readonly kind: 'digital-subscription';
  readonly planReference: PlanReference;
  readonly durationReference: DurationReference;
};

export type ProvisioningParameters = DigitalSubscriptionProvisioningParameters;

export type ProvisioningParametersValidationError = {
  readonly reasonCode:
    'invalid-parameters-kind' | 'invalid-plan-reference' | 'invalid-duration-reference';
};

export const createDigitalSubscriptionProvisioningParameters = (input: {
  readonly planReference: unknown;
  readonly durationReference: unknown;
}): Result<DigitalSubscriptionProvisioningParameters, ProvisioningParametersValidationError> => {
  const planReferenceResult = parsePlanReference(input.planReference);
  if (!planReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-plan-reference' });
  }

  const durationReferenceResult = parseDurationReference(input.durationReference);
  if (!durationReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-duration-reference' });
  }

  return Result.ok({
    kind: 'digital-subscription',
    planReference: planReferenceResult.value,
    durationReference: durationReferenceResult.value,
  });
};

export const cloneProvisioningParameters = (
  parameters: ProvisioningParameters,
): ProvisioningParameters => ({
  kind: parameters.kind,
  planReference: parameters.planReference,
  durationReference: parameters.durationReference,
});

export const parseProvisioningParameters = (
  value: unknown,
): Result<ProvisioningParameters, ProvisioningParametersValidationError> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return Result.fail({ reasonCode: 'invalid-parameters-kind' });
  }

  const record = value as Record<string, unknown>;

  if (record.kind !== 'digital-subscription') {
    return Result.fail({ reasonCode: 'invalid-parameters-kind' });
  }

  return createDigitalSubscriptionProvisioningParameters({
    planReference: record.planReference,
    durationReference: record.durationReference,
  });
};
