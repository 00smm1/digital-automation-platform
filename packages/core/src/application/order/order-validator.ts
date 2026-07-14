import type { OrderProcessingRequest } from '../../domain/order/order-processing-request.js';
import { OrderValidationError } from '../../domain/order/errors/order-errors.js';
import { Guard } from '../../shared/utils/guard.js';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown validation error';
};

/**
 * Validates order processing requests before planning and execution.
 */
export class OrderValidator {
  validate(request: OrderProcessingRequest): void {
    try {
      Guard.againstEmptyString(request.runId, 'runId');
      Guard.againstEmptyString(request.order.id, 'order.id');
      Guard.againstEmptyString(request.customer.id, 'customer.id');

      if (request.order.items.length === 0) {
        throw new OrderValidationError('Order must contain at least one item.');
      }

      if (request.order.status !== 'pending') {
        throw new OrderValidationError(
          `Order must be in pending status. Current status: "${request.order.status}".`,
        );
      }

      for (const item of request.order.items) {
        Guard.againstEmptyString(item.id, 'orderItem.id');
        Guard.againstEmptyString(item.productId, 'orderItem.productId');

        if (item.quantity < 1) {
          throw new OrderValidationError(
            `Order item "${item.id}" must have quantity of at least 1.`,
          );
        }

        if (item.requirements.requiresProvider) {
          Guard.againstEmptyString(item.providerId ?? '', 'orderItem.providerId');
          Guard.againstEmptyString(item.providerCapability ?? '', 'orderItem.providerCapability');
        }

        const pipelineId = item.pipelineId ?? request.defaultPipelineId;

        if (pipelineId !== undefined) {
          if (request.pipelines[pipelineId] === undefined) {
            throw new OrderValidationError(
              `Pipeline "${pipelineId}" for order item "${item.id}" was not supplied.`,
            );
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof OrderValidationError) {
        throw error;
      }

      throw new OrderValidationError(toErrorMessage(error), {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
