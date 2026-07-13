import type { DomainEvent } from '../../domain/events/domain-event.js';
import type { EventHandler } from '../../domain/events/event-handler.js';

export type Unsubscribe = () => void;

/**
 * Application-level contract for dispatching domain events to handlers.
 */
export interface EventBus {
  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent['eventName'],
    handler: EventHandler<TEvent>,
  ): Unsubscribe;

  unsubscribe<TEvent extends DomainEvent>(
    eventName: TEvent['eventName'],
    handler: EventHandler<TEvent>,
  ): boolean;

  publish<TEvent extends DomainEvent>(event: TEvent): Promise<void>;

  publishAll<TEvents extends readonly DomainEvent[]>(events: TEvents): Promise<void>;
}
