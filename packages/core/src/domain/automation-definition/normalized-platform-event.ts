export type NormalizedPlatformEventPayload = Readonly<Record<string, unknown>>;

/**
 * Provider-independent inbound platform event envelope for rule matching.
 */
export type NormalizedPlatformEvent = {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: NormalizedPlatformEventPayload;
};

export const createNormalizedPlatformEvent = (
  params: NormalizedPlatformEvent,
): NormalizedPlatformEvent => params;
