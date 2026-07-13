import type { ICommand } from '../commands/command.js';

/**
 * Executes a command and optionally returns a result.
 */
export interface ICommandHandler<TCommand extends ICommand, TResult = void> {
  readonly commandName: TCommand['commandName'];
  execute(command: TCommand): Promise<TResult>;
}
