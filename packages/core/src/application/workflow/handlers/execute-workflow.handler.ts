import type { ICommandHandler } from '../../handlers/command-handler.js';
import type { WorkflowRuntime } from '../workflow-runtime.js';
import {
  ExecuteWorkflowCommandName,
  type ExecuteWorkflowCommand,
  type ExecuteWorkflowCommandResult,
} from '../commands/execute-workflow.command.js';

/**
 * CQRS handler that delegates workflow execution to WorkflowRuntime.
 */
export class ExecuteWorkflowCommandHandler implements ICommandHandler<
  ExecuteWorkflowCommand,
  ExecuteWorkflowCommandResult
> {
  readonly commandName = ExecuteWorkflowCommandName;

  constructor(private readonly runtime: WorkflowRuntime) {}

  execute(command: ExecuteWorkflowCommand): Promise<ExecuteWorkflowCommandResult> {
    return this.runtime.execute(command.request);
  }
}
