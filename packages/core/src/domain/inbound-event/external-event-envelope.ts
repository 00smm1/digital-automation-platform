/**
 * Provider-neutral envelope for an event received from an external source.
 */
export type ExternalEventEnvelope = {
  readonly sourceId: string;
  readonly externalEventId: string;
  readonly eventType: string;
  readonly receivedAt: Date;
  readonly payload: unknown;
  readonly headers: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export const createExternalEventEnvelope = (
  params: ExternalEventEnvelope,
): ExternalEventEnvelope => ({
  sourceId: params.sourceId,
  externalEventId: params.externalEventId,
  eventType: params.eventType,
  receivedAt: params.receivedAt,
  payload: params.payload,
  headers: { ...params.headers },
  metadata: { ...params.metadata },
});
