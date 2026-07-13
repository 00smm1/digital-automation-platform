import type { ICommandHandler } from '../../handlers/command-handler.js';
import type { AutomationResult } from '../../../domain/automation/automation-result.js';
import type { ExecuteAutomationCommand } from '../commands/execute-automation.command.js';
import { ExecuteAutomationCommandName } from '../commands/execute-automation.command.js';
import { AutomationExecutor } from '../automation-executor.js';

/**
 * CQRS handler that delegates automation execution to AutomationExecutor.
 */
export class ExecuteAutomationCommandHandler implements ICommandHandler<
  ExecuteAutomationCommand,
  AutomationResult
> {
  readonly commandName = ExecuteAutomationCommandName;

  constructor(private readonly executor: AutomationExecutor) {}

  execute(command: ExecuteAutomationCommand): Promise<AutomationResult> {
    return this.executor.execute(command.pipeline, command.context);
  }
}
