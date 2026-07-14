import type { OrderProcessingRequest } from '../../domain/order/order-processing-request.js';
import {
  createOrderProcessingResult,
  type OrderProcessingResult,
} from '../../domain/order/order-processing-result.js';
import {
  createOrderProcessingCompletedEvent,
  createOrderProcessingFailedEvent,
  createOrderProcessingStartedEvent,
} from '../../domain/order/events/order-events.js';
import { OrderValidationError } from '../../domain/order/errors/order-errors.js';
import type { OrderProcessingServiceDependencies } from './order-processing-service.dependencies.js';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown order processing error';
};

/**
 * Orchestrates order validation, planning, and fulfillment execution.
 */
export class OrderProcessingService {
  private readonly dependencies: OrderProcessingServiceDependencies;

  constructor(dependencies: OrderProcessingServiceDependencies) {
    this.dependencies = dependencies;
  }

  async process(request: OrderProcessingRequest): Promise<OrderProcessingResult> {
    const startedAt = new Date();

    await this.dependencies.eventBus.publish(
      createOrderProcessingStartedEvent({
        runId: request.runId,
        orderId: request.order.id,
        occurredAt: startedAt,
      }),
    );

    try {
      this.dependencies.validator.validate(request);
      request.order.markProcessing();

      const plan = this.dependencies.planBuilder.build(request);
      const result = await this.dependencies.processor.process(plan, request, startedAt);

      if (result.status === 'completed') {
        await this.dependencies.eventBus.publish(createOrderProcessingCompletedEvent(result));
        return result;
      }

      await this.dependencies.eventBus.publish(createOrderProcessingFailedEvent(result));
      return result;
    } catch (error: unknown) {
      const failureReason = toErrorMessage(error);
      const completedAt = new Date();
      const failedResult = createOrderProcessingResult({
        runId: request.runId,
        orderId: request.order.id,
        orderStatus: request.order.status,
        status: 'failed',
        startedAt,
        completedAt,
        failureReason,
      });

      await this.dependencies.eventBus.publish(createOrderProcessingFailedEvent(failedResult));

      if (error instanceof OrderValidationError) {
        return failedResult;
      }

      return failedResult;
    }
  }
}
