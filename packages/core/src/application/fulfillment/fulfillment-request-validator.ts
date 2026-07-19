import type { DigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { FulfillmentValidationError } from '../../domain/fulfillment/errors/fulfillment-errors.js';
import { Guard } from '../../shared/utils/guard.js';

/**
 * Validates digital fulfillment requests before orchestration.
 */
export class FulfillmentRequestValidator {
  validate(request: DigitalFulfillmentRequest): void {
    Guard.againstEmptyString(request.eventId, 'eventId');
    Guard.againstEmptyString(request.eventType, 'eventType');
    Guard.againstEmptyString(request.externalOrderReference, 'externalOrderReference');
    Guard.againstEmptyString(request.customerReference, 'customerReference');
    Guard.againstEmptyString(request.productReference, 'productReference');

    if (!Number.isSafeInteger(request.quantity) || request.quantity < 1) {
      throw new FulfillmentValidationError('Quantity must be a safe integer of at least 1.');
    }

    if (!(request.occurredAt instanceof Date) || Number.isNaN(request.occurredAt.getTime())) {
      throw new FulfillmentValidationError('occurredAt must be a valid Date.');
    }
  }
}
