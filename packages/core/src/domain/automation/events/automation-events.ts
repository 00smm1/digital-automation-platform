import { createEventName } from '../../events/event-name.js';
import type { DomainEvent } from '../../events/domain-event.js';
import type { AutomationResult } from '../automation-result.js';

export const AutomationSucceededEventName = createEventName('automation.succeeded');
export const AutomationFailedEventName = createEventName('automation.failed');

export type AutomationSucceededEvent = DomainEvent<typeof AutomationSucceededEventName> & {
  readonly result: AutomationResult;
};

export type AutomationFailedEvent = DomainEvent<typeof AutomationFailedEventName> & {
  readonly result: AutomationResult;
};

export const createAutomationSucceededEvent = (
  result: AutomationResult,
): AutomationSucceededEvent => ({
  eventId: `${result.runId}:succeeded`,
  occurredAt: result.completedAt,
  aggregateId: result.runId,
  eventName: AutomationSucceededEventName,
  result,
});

export const createAutomationFailedEvent = (result: AutomationResult): AutomationFailedEvent => ({
  eventId: `${result.runId}:failed`,
  occurredAt: result.completedAt,
  aggregateId: result.runId,
  eventName: AutomationFailedEventName,
  result,
});
