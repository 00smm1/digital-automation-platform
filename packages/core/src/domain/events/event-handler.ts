import type { DomainEvent } from './domain-event.js';

/**
 * Handles a single domain event type.
 */
export interface EventHandler<TEvent extends DomainEvent = DomainEvent> {
  readonly eventName: TEvent['eventName'];
  handle(event: TEvent): Promise<void> | void;
}

/**
 * @deprecated Use EventHandler instead.
 */
export type IDomainEventHandler<TEvent extends DomainEvent> = EventHandler<TEvent>;
