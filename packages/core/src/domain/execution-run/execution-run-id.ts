import type { IdempotencyKey } from '../inbound-event/idempotency-key.js';

export type ExecutionRunId = string & { readonly __brand: 'ExecutionRunId' };

/**
 * Stable run identity aligned with inbound idempotency for one accepted external event.
 */
export const createExecutionRunId = (params: { idempotencyKey: IdempotencyKey }): ExecutionRunId =>
  String(params.idempotencyKey) as ExecutionRunId;
