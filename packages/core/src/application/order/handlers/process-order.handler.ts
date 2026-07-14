import type { ICommandHandler } from '../../handlers/command-handler.js';
import type { OrderProcessingService } from '../order-processing-service.js';
import {
  ProcessOrderCommandName,
  type ProcessOrderCommand,
  type ProcessOrderCommandResult,
} from '../commands/process-order.command.js';

/**
 * CQRS handler that delegates order processing to OrderProcessingService.
 */
export class ProcessOrderCommandHandler implements ICommandHandler<
  ProcessOrderCommand,
  ProcessOrderCommandResult
> {
  readonly commandName = ProcessOrderCommandName;

  constructor(private readonly service: OrderProcessingService) {}

  execute(command: ProcessOrderCommand): Promise<ProcessOrderCommandResult> {
    return this.service.process(command.request);
  }
}
