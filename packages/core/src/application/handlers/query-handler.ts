import type { IQuery } from '../queries/query.js';

/**
 * Executes a query and returns a typed result.
 */
export interface IQueryHandler<TQuery extends IQuery<TResult>, TResult = unknown> {
  readonly queryName: TQuery['queryName'];
  execute(query: TQuery): Promise<TResult>;
}
