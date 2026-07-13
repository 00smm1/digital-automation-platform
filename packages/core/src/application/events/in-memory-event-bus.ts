import type { DomainEvent } from '../../domain/events/domain-event.js';
import type { EventHandler } from '../../domain/events/event-handler.js';
import type { EventBus, Unsubscribe } from './event-bus.js';

type RegisteredHandler = {
  readonly handler: EventHandler<DomainEvent>;
};

/**
 * In-memory event bus with deterministic handler execution order.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, RegisteredHandler[]>();

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent['eventName'],
    handler: EventHandler<TEvent>,
  ): Unsubscribe {
    const registeredHandler: RegisteredHandler = {
      handler: handler as EventHandler<DomainEvent>,
    };

    const eventHandlers = this.handlers.get(eventName) ?? [];
    eventHandlers.push(registeredHandler);
    this.handlers.set(eventName, eventHandlers);

    return () => {
      this.unsubscribe(eventName, handler);
    };
  }

  unsubscribe<TEvent extends DomainEvent>(
    eventName: TEvent['eventName'],
    handler: EventHandler<TEvent>,
  ): boolean {
    const eventHandlers = this.handlers.get(eventName);

    if (eventHandlers === undefined) {
      return false;
    }

    const index = eventHandlers.findIndex((entry) => entry.handler === handler);

    if (index === -1) {
      return false;
    }

    eventHandlers.splice(index, 1);

    if (eventHandlers.length === 0) {
      this.handlers.delete(eventName);
    }

    return true;
  }

  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventName) ?? [];

    for (const { handler } of eventHandlers) {
      await this.invokeHandler(handler, event);
    }
  }

  async publishAll<TEvents extends readonly DomainEvent[]>(events: TEvents): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  private async invokeHandler(
    handler: EventHandler<DomainEvent>,
    event: DomainEvent,
  ): Promise<void> {
    try {
      await handler.handle(event);
    } catch {
      // Handler failures are isolated so other handlers can continue.
    }
  }
}
