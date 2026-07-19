import { ValueObject } from '../value-objects/value-object.js';
import type { AutomationCondition } from './automation-condition.js';
import { InvalidAutomationConditionGroupError } from './errors/automation-definition-errors.js';

export const CONDITION_GROUP_MODES = ['ALL', 'ANY'] as const;

export type ConditionGroupMode = (typeof CONDITION_GROUP_MODES)[number];

export type ConditionGroupProps = {
  readonly mode: ConditionGroupMode;
  readonly conditions: readonly AutomationCondition[];
};

/**
 * Logical grouping of conditions with ALL or ANY semantics.
 *
 * Empty groups: when conditions is empty, evaluation always passes (see RuleEvaluator).
 */
export class ConditionGroup extends ValueObject<ConditionGroupProps> {
  private constructor(props: ConditionGroupProps) {
    super(props);
  }

  static create(params: {
    mode: ConditionGroupMode;
    conditions?: readonly AutomationCondition[];
  }): ConditionGroup {
    if (!CONDITION_GROUP_MODES.includes(params.mode)) {
      throw new InvalidAutomationConditionGroupError(
        `Invalid condition group mode "${params.mode}".`,
      );
    }

    return new ConditionGroup({
      mode: params.mode,
      conditions: params.conditions ?? [],
    });
  }

  get mode(): ConditionGroupMode {
    return this.props.mode;
  }

  get conditions(): readonly AutomationCondition[] {
    return this.props.conditions;
  }

  isEmpty(): boolean {
    return this.props.conditions.length === 0;
  }
}
