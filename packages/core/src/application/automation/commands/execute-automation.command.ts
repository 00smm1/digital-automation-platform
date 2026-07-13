import type { ICommand } from '../../commands/command.js';
import type { AutomationPipeline } from '../../../domain/automation/automation-pipeline.js';
import type { AutomationContext } from '../../../domain/automation/automation-context.js';

export const ExecuteAutomationCommandName = 'automation.execute' as const;

/**
 * CQRS command for running an automation pipeline.
 */
export interface ExecuteAutomationCommand extends ICommand {
  readonly commandName: typeof ExecuteAutomationCommandName;
  readonly pipeline: AutomationPipeline;
  readonly context: AutomationContext;
}

export const createExecuteAutomationCommand = (
  pipeline: AutomationPipeline,
  context: AutomationContext,
): ExecuteAutomationCommand => ({
  commandName: ExecuteAutomationCommandName,
  pipeline,
  context,
});
