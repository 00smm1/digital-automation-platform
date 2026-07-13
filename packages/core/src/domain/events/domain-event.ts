import type { EventName } from './event-name.js';

/**
 * Contract for immutable facts that occurred inside the domain.
 */
export interface DomainEvent<TEventName extends EventName = EventName> {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly eventName: TEventName;
}
