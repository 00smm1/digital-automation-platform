import type { DomainEvent } from './domain-event.js';

/**
 * Handles a single domain event type.
 */
export interface IDomainEventHandler<TEvent extends DomainEvent> {
  readonly eventName: TEvent['eventName'];
  handle(event: TEvent): Promise<void> | void;
}
