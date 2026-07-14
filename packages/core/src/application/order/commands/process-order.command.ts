import type { ICommand } from '../../commands/command.js';
import type { OrderProcessingRequest } from '../../../domain/order/order-processing-request.js';
import type { OrderProcessingResult } from '../../../domain/order/order-processing-result.js';

export const ProcessOrderCommandName = 'order.process' as const;

/**
 * CQRS command for processing an order through the fulfillment engine.
 */
export interface ProcessOrderCommand extends ICommand {
  readonly commandName: typeof ProcessOrderCommandName;
  readonly request: OrderProcessingRequest;
}

export const createProcessOrderCommand = (
  request: OrderProcessingRequest,
): ProcessOrderCommand => ({
  commandName: ProcessOrderCommandName,
  request,
});

export type ProcessOrderCommandResult = OrderProcessingResult;
