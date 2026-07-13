import { describe, expect, it, vi } from 'vitest';

import { createEventName } from '../../domain/events/event-name.js';
import type { DomainEvent } from '../../domain/events/domain-event.js';
import type { EventHandler } from '../../domain/events/event-handler.js';
import type { Unsubscribe } from './event-bus.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

const TestEventName = createEventName('platform.test');

type TestEvent = DomainEvent<typeof TestEventName>;

const AnotherEventName = createEventName('platform.another');

type AnotherEvent = DomainEvent<typeof AnotherEventName>;

const createTestEvent = (overrides: Partial<TestEvent> = {}): TestEvent => ({
  eventId: 'event-1',
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  aggregateId: 'aggregate-1',
  eventName: TestEventName,
  ...overrides,
});

const createHandler = (
  eventName: TestEvent['eventName'],
  onHandle: (event: TestEvent) => Promise<void> | void,
): EventHandler<TestEvent> => ({
  eventName,
  handle: onHandle,
});

describe('InMemoryEventBus', () => {
  it('publishes one event to a subscribed handler', async () => {
    const bus = new InMemoryEventBus();
    const handle = vi.fn();

    bus.subscribe(TestEventName, createHandler(TestEventName, handle));

    const event = createTestEvent();
    await bus.publish(event);

    expect(handle).toHaveBeenCalledOnce();
    expect(handle).toHaveBeenCalledWith(event);
  });

  it('notifies multiple handlers for the same event', async () => {
    const bus = new InMemoryEventBus();
    const first = vi.fn();
    const second = vi.fn();

    bus.subscribe(TestEventName, createHandler(TestEventName, first));
    bus.subscribe(TestEventName, createHandler(TestEventName, second));

    const event = createTestEvent();
    await bus.publish(event);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('unsubscribes a handler', async () => {
    const bus = new InMemoryEventBus();
    const first = vi.fn();
    const second = vi.fn();
    const firstHandler = createHandler(TestEventName, first);
    const secondHandler = createHandler(TestEventName, second);

    bus.subscribe(TestEventName, firstHandler);
    bus.subscribe(TestEventName, secondHandler);

    expect(bus.unsubscribe(TestEventName, firstHandler)).toBe(true);

    await bus.publish(createTestEvent());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('isolates handler failures so other handlers still run', async () => {
    const onHandlerError = vi.fn();
    const bus = new InMemoryEventBus({ onHandlerError });
    const failingHandler = createHandler(TestEventName, async () => {
      throw new Error('handler failed');
    });
    const succeeding = vi.fn();

    bus.subscribe(TestEventName, failingHandler);
    bus.subscribe(TestEventName, createHandler(TestEventName, succeeding));

    await expect(bus.publish(createTestEvent())).resolves.toBeUndefined();

    expect(onHandlerError).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
  });

  it('invokes the error callback when a handler fails', async () => {
    const onHandlerError = vi.fn();
    const bus = new InMemoryEventBus({ onHandlerError });
    const error = new Error('handler failed');
    const failingHandler = createHandler(TestEventName, async () => {
      throw error;
    });

    const event = createTestEvent();
    bus.subscribe(TestEventName, failingHandler);

    await bus.publish(event);

    expect(onHandlerError).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledWith(error, event, failingHandler);
  });

  it('executes later handlers after a failure and reports the error', async () => {
    const onHandlerError = vi.fn();
    const bus = new InMemoryEventBus({ onHandlerError });
    const failingHandler = createHandler(TestEventName, async () => {
      throw new Error('handler failed');
    });
    const succeeding = vi.fn();

    bus.subscribe(TestEventName, failingHandler);
    bus.subscribe(TestEventName, createHandler(TestEventName, succeeding));

    await bus.publish(createTestEvent());

    expect(onHandlerError).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
  });

  it('does not skip the next handler when a handler unsubscribes itself during publish', async () => {
    const bus = new InMemoryEventBus();
    const second = vi.fn();
    let unsubscribeSelf: Unsubscribe = () => undefined;

    const selfRemovingHandler = createHandler(TestEventName, () => {
      unsubscribeSelf();
    });

    unsubscribeSelf = bus.subscribe(TestEventName, selfRemovingHandler);
    bus.subscribe(TestEventName, createHandler(TestEventName, second));

    await bus.publish(createTestEvent());

    expect(second).toHaveBeenCalledOnce();
  });

  it('publishes multiple events with publishAll', async () => {
    const bus = new InMemoryEventBus();
    const testHandler = vi.fn();
    const anotherHandler = vi.fn();

    bus.subscribe(TestEventName, createHandler(TestEventName, testHandler));
    bus.subscribe(AnotherEventName, {
      eventName: AnotherEventName,
      handle: anotherHandler,
    });

    const firstEvent = createTestEvent({ eventId: 'event-1' });
    const secondEvent: AnotherEvent = {
      eventId: 'event-2',
      occurredAt: new Date('2026-01-02T00:00:00.000Z'),
      aggregateId: 'aggregate-2',
      eventName: AnotherEventName,
    };

    await bus.publishAll([firstEvent, secondEvent]);

    expect(testHandler).toHaveBeenCalledOnce();
    expect(testHandler).toHaveBeenCalledWith(firstEvent);
    expect(anotherHandler).toHaveBeenCalledOnce();
    expect(anotherHandler).toHaveBeenCalledWith(secondEvent);
  });

  it('executes handlers in deterministic subscription order', async () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];

    bus.subscribe(
      TestEventName,
      createHandler(TestEventName, async () => {
        order.push('first');
      }),
    );
    bus.subscribe(
      TestEventName,
      createHandler(TestEventName, async () => {
        order.push('second');
      }),
    );
    bus.subscribe(
      TestEventName,
      createHandler(TestEventName, async () => {
        order.push('third');
      }),
    );

    await bus.publish(createTestEvent());

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('returns an unsubscribe function from subscribe', async () => {
    const bus = new InMemoryEventBus();
    const handle = vi.fn();
    const unsubscribe = bus.subscribe(TestEventName, createHandler(TestEventName, handle));

    unsubscribe();

    await bus.publish(createTestEvent());

    expect(handle).not.toHaveBeenCalled();
  });
});
