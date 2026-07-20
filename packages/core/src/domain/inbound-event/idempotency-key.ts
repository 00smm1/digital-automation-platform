export type IdempotencyKey = string & { readonly __brand: 'IdempotencyKey' };

export const createIdempotencyKey = (params: {
  sourceId: string;
  externalEventId: string;
}): IdempotencyKey => {
  return `${params.sourceId}:${params.externalEventId}` as IdempotencyKey;
};
