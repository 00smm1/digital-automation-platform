import { ValueObject } from '../value-objects/value-object.js';
import { InvalidAutomationTriggerError } from './errors/automation-definition-errors.js';

export type AutomationTriggerProps = {
  readonly eventType: string;
};

/**
 * Normalized platform event trigger for an automation definition.
 */
export class AutomationTrigger extends ValueObject<AutomationTriggerProps> {
  private constructor(props: AutomationTriggerProps) {
    super(props);
  }

  static create(eventType: string): AutomationTrigger {
    const normalized = eventType.trim();

    if (normalized.length === 0) {
      throw new InvalidAutomationTriggerError('Trigger event type must not be empty.');
    }

    return new AutomationTrigger({ eventType: normalized });
  }

  get eventType(): string {
    return this.props.eventType;
  }

  matches(eventType: string): boolean {
    return this.props.eventType === eventType;
  }
}
