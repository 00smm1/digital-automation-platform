import { ValueObject } from '../value-objects/value-object.js';
import type { ConditionOperator } from './condition-operator.js';
import { isConditionOperator } from './condition-operator.js';
import {
  InvalidAutomationConditionError,
  InvalidConditionOperatorError,
} from './errors/automation-definition-errors.js';

export type AutomationConditionProps = {
  readonly fieldPath: string;
  readonly operator: ConditionOperator;
  readonly expectedValue?: unknown;
};

/**
 * Field-based condition evaluated against normalized event payload data.
 */
export class AutomationCondition extends ValueObject<AutomationConditionProps> {
  private constructor(props: AutomationConditionProps) {
    super(props);
  }

  static create(params: {
    fieldPath: string;
    operator: ConditionOperator | string;
    expectedValue?: unknown;
  }): AutomationCondition {
    const fieldPath = params.fieldPath.trim();

    if (fieldPath.length === 0) {
      throw new InvalidAutomationConditionError('Condition field path must not be empty.');
    }

    if (!isConditionOperator(params.operator)) {
      throw new InvalidConditionOperatorError(String(params.operator));
    }

    if (params.operator === 'in' && !Array.isArray(params.expectedValue)) {
      throw new InvalidAutomationConditionError(
        'Operator "in" requires expectedValue to be an array.',
      );
    }

    if (
      (params.operator === 'exists' || params.operator === 'notExists') &&
      params.expectedValue !== undefined
    ) {
      throw new InvalidAutomationConditionError(
        `Operator "${params.operator}" must not include expectedValue.`,
      );
    }

    return new AutomationCondition({
      fieldPath,
      operator: params.operator,
      expectedValue: params.expectedValue,
    });
  }

  get fieldPath(): string {
    return this.props.fieldPath;
  }

  get operator(): ConditionOperator {
    return this.props.operator;
  }

  get expectedValue(): unknown {
    return this.props.expectedValue;
  }
}
