import type { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import { FulfillmentRequestValidator } from './fulfillment-request-validator.js';
import { mapFulfillmentRequestToPlatformEvent } from './fulfillment-event-mapper.js';
import {
  mapOrchestrationToFulfillmentResult,
  mapValidationFailureToFulfillmentResult,
} from './fulfillment-result-mapper.js';
import type { DigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import type { DigitalFulfillmentResult } from '../../domain/fulfillment/digital-fulfillment-result.js';
import { FulfillmentValidationError } from '../../domain/fulfillment/errors/fulfillment-errors.js';

export type DigitalFulfillmentServiceDependencies = {
  readonly orchestrator: PlatformEventOrchestrator;
  readonly validator?: FulfillmentRequestValidator;
};

/**
 * Application use case for digital product fulfillment through platform orchestration.
 */
export class DigitalFulfillmentService {
  private readonly orchestrator: PlatformEventOrchestrator;
  private readonly validator: FulfillmentRequestValidator;

  constructor(dependencies: DigitalFulfillmentServiceDependencies) {
    this.orchestrator = dependencies.orchestrator;
    this.validator = dependencies.validator ?? new FulfillmentRequestValidator();
  }

  async fulfill(request: DigitalFulfillmentRequest): Promise<DigitalFulfillmentResult> {
    const startedAt = new Date();

    try {
      this.validator.validate(request);
    } catch (error: unknown) {
      const completedAt = new Date();
      const failureReason =
        error instanceof FulfillmentValidationError
          ? error.message
          : 'Fulfillment request validation failed.';

      return mapValidationFailureToFulfillmentResult({
        request,
        failureReason,
        startedAt,
        completedAt,
      });
    }

    const event = mapFulfillmentRequestToPlatformEvent(request);
    const eventSnapshot = JSON.stringify(event);
    const orchestrationResult = await this.orchestrator.process(event);
    const completedAt = new Date();

    if (JSON.stringify(event) !== eventSnapshot) {
      throw new Error('Normalized platform event must remain immutable during fulfillment.');
    }

    return mapOrchestrationToFulfillmentResult({
      request,
      orchestrationResult,
      startedAt,
      completedAt,
    });
  }
}
