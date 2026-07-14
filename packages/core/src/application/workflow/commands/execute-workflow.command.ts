import type { ICommand } from '../../commands/command.js';
import type { WorkflowRuntimeExecuteRequest } from '../workflow-runtime.js';
import type { WorkflowExecutionResult } from '../../../domain/workflow/workflow-execution-result.js';

export const ExecuteWorkflowCommandName = 'workflow.execute' as const;

/**
 * CQRS command for executing a workflow plan through the runtime.
 */
export interface ExecuteWorkflowCommand extends ICommand {
  readonly commandName: typeof ExecuteWorkflowCommandName;
  readonly request: WorkflowRuntimeExecuteRequest;
}

export const createExecuteWorkflowCommand = (
  request: WorkflowRuntimeExecuteRequest,
): ExecuteWorkflowCommand => ({
  commandName: ExecuteWorkflowCommandName,
  request,
});

export type ExecuteWorkflowCommandResult = WorkflowExecutionResult;
