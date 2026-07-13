import type { EventBus } from '../events/event-bus.js';
import type { AutomationContext } from '../../domain/automation/automation-context.js';

/**
 * Injectable dependencies for automation execution.
 */
export type AutomationExecutorDependencies = {
  readonly eventBus: EventBus;
  readonly validate?: (context: AutomationContext) => void | Promise<void>;
};
