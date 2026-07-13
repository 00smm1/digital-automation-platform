/**
 * Marker contract for state-changing application requests.
 */
export interface ICommand {
  readonly commandName: string;
}
