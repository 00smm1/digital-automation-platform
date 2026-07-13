/**
 * Marker contract for read-only application requests.
 * The phantom __resultType property enables typed handler inference.
 */
export interface IQuery<TResult> {
  readonly queryName: string;
  readonly __resultType?: TResult;
}
