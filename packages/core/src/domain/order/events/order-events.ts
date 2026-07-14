import { createEventName } from '../../events/event-name.js';
import type { DomainEvent } from '../../events/domain-event.js';
import type { OrderProcessingResult } from '../order-processing-result.js';

export const OrderProcessingStartedEventName = createEventName('order.processing.started');
export const OrderProcessingCompletedEventName = createEventName('order.processing.completed');
export const OrderProcessingFailedEventName = createEventName('order.processing.failed');

export type OrderProcessingStartedEvent = DomainEvent<typeof OrderProcessingStartedEventName> & {
  readonly runId: string;
  readonly orderId: string;
};

export type OrderProcessingCompletedEvent = DomainEvent<
  typeof OrderProcessingCompletedEventName
> & {
  readonly result: OrderProcessingResult;
};

export type OrderProcessingFailedEvent = DomainEvent<typeof OrderProcessingFailedEventName> & {
  readonly result: OrderProcessingResult;
};

export const createOrderProcessingStartedEvent = (params: {
  runId: string;
  orderId: string;
  occurredAt?: Date;
}): OrderProcessingStartedEvent => ({
  eventId: `${params.runId}:started`,
  occurredAt: params.occurredAt ?? new Date(),
  aggregateId: params.orderId,
  eventName: OrderProcessingStartedEventName,
  runId: params.runId,
  orderId: params.orderId,
});

export const createOrderProcessingCompletedEvent = (
  result: OrderProcessingResult,
): OrderProcessingCompletedEvent => ({
  eventId: `${result.runId}:completed`,
  occurredAt: result.completedAt,
  aggregateId: result.orderId,
  eventName: OrderProcessingCompletedEventName,
  result,
});

export const createOrderProcessingFailedEvent = (
  result: OrderProcessingResult,
): OrderProcessingFailedEvent => ({
  eventId: `${result.runId}:failed`,
  occurredAt: result.completedAt,
  aggregateId: result.orderId,
  eventName: OrderProcessingFailedEventName,
  result,
});
