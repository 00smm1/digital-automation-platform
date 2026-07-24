import {
  createBusinessIdempotencyReferenceFromExecutionRun,
  parseBusinessIdempotencyReference,
  parseCorrelationReference,
  parseExecutionRunReference,
  parseExternalOrderReference,
  parseFulfillmentDefinitionReference,
  parseInventoryItemReference,
  parseReservationReference,
  type BusinessIdempotencyReference,
  type CorrelationReference,
} from '../domain/provider-references.js';
import { parseProviderCapability } from '../domain/provider-capability.js';
import {
  cloneProvisioningParameters,
  parseProvisioningParameters,
} from '../domain/provisioning-parameters.js';
import { parseReservedQuantity } from '../domain/reserved-quantity.js';
import { Result } from '../shared/result.js';
import type { ProviderExecutionRequest } from './ports/provider-adapter-port.js';

export type ProviderExecutionRequestInput = {
  readonly executionRunReference: unknown;
  readonly externalOrderReference: unknown;
  readonly reservationReference: unknown;
  readonly inventoryItemReference: unknown;
  readonly requiredCapability: unknown;
  readonly quantity: unknown;
  readonly fulfillmentDefinitionReference: unknown;
  readonly provisioningParameters: unknown;
  readonly businessIdempotencyReference?: unknown;
  readonly correlationReference?: unknown;
};

export type ProviderExecutionRequestValidationError = {
  readonly reasonCode:
    | 'invalid-execution-run-reference'
    | 'invalid-external-order-reference'
    | 'invalid-reservation-reference'
    | 'invalid-inventory-item-reference'
    | 'invalid-required-capability'
    | 'invalid-quantity'
    | 'invalid-fulfillment-definition-reference'
    | 'invalid-provisioning-parameters'
    | 'invalid-business-idempotency-reference'
    | 'invalid-correlation-reference';
};

export const createProviderExecutionRequest = (
  input: ProviderExecutionRequestInput,
): Result<ProviderExecutionRequest, ProviderExecutionRequestValidationError> => {
  const executionRunReferenceResult = parseExecutionRunReference(input.executionRunReference);
  if (!executionRunReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-execution-run-reference' });
  }

  const externalOrderReferenceResult = parseExternalOrderReference(input.externalOrderReference);
  if (!externalOrderReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-external-order-reference' });
  }

  const reservationReferenceResult = parseReservationReference(input.reservationReference);
  if (!reservationReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-reservation-reference' });
  }

  const inventoryItemReferenceResult = parseInventoryItemReference(input.inventoryItemReference);
  if (!inventoryItemReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-inventory-item-reference' });
  }

  const capabilityResult = parseProviderCapability(input.requiredCapability);
  if (!capabilityResult.ok) {
    return Result.fail({ reasonCode: 'invalid-required-capability' });
  }

  const quantityResult = parseReservedQuantity(input.quantity);
  if (!quantityResult.ok) {
    return Result.fail({ reasonCode: 'invalid-quantity' });
  }

  const fulfillmentDefinitionReferenceResult = parseFulfillmentDefinitionReference(
    input.fulfillmentDefinitionReference,
  );
  if (!fulfillmentDefinitionReferenceResult.ok) {
    return Result.fail({ reasonCode: 'invalid-fulfillment-definition-reference' });
  }

  const provisioningParametersResult = parseProvisioningParameters(input.provisioningParameters);
  if (!provisioningParametersResult.ok) {
    return Result.fail({ reasonCode: 'invalid-provisioning-parameters' });
  }

  let businessIdempotencyReference: BusinessIdempotencyReference;
  if (input.businessIdempotencyReference === undefined) {
    businessIdempotencyReference = createBusinessIdempotencyReferenceFromExecutionRun(
      executionRunReferenceResult.value,
    );
  } else {
    const businessIdempotencyReferenceResult = parseBusinessIdempotencyReference(
      input.businessIdempotencyReference,
    );
    if (!businessIdempotencyReferenceResult.ok) {
      return Result.fail({ reasonCode: 'invalid-business-idempotency-reference' });
    }
    businessIdempotencyReference = businessIdempotencyReferenceResult.value;
  }

  let correlationReference: CorrelationReference | undefined;
  if (input.correlationReference !== undefined) {
    const correlationReferenceResult = parseCorrelationReference(input.correlationReference);
    if (!correlationReferenceResult.ok) {
      return Result.fail({ reasonCode: 'invalid-correlation-reference' });
    }
    correlationReference = correlationReferenceResult.value;
  }

  return Result.ok({
    executionRunReference: executionRunReferenceResult.value,
    externalOrderReference: externalOrderReferenceResult.value,
    reservationReference: reservationReferenceResult.value,
    inventoryItemReference: inventoryItemReferenceResult.value,
    requiredCapability: capabilityResult.value,
    quantity: quantityResult.value,
    fulfillmentDefinitionReference: fulfillmentDefinitionReferenceResult.value,
    provisioningParameters: cloneProvisioningParameters(provisioningParametersResult.value),
    businessIdempotencyReference,
    correlationReference,
  });
};

export const cloneProviderExecutionRequest = (
  request: ProviderExecutionRequest,
): ProviderExecutionRequest => ({
  executionRunReference: request.executionRunReference,
  externalOrderReference: request.externalOrderReference,
  reservationReference: request.reservationReference,
  inventoryItemReference: request.inventoryItemReference,
  requiredCapability: request.requiredCapability,
  quantity: request.quantity,
  fulfillmentDefinitionReference: request.fulfillmentDefinitionReference,
  provisioningParameters: cloneProvisioningParameters(request.provisioningParameters),
  businessIdempotencyReference: request.businessIdempotencyReference,
  correlationReference: request.correlationReference,
});
