import type { AutomationCondition } from './automation-condition.js';
import type { ConditionGroup } from './condition-group.js';
import type { NormalizedPlatformEventPayload } from './normalized-platform-event.js';

export type RuleEvaluationResult = {
  readonly matched: boolean;
  readonly failedConditionIndexes: readonly number[];
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

/**
 * Resolves a dot-notation field path against a payload object.
 * Returns undefined when the path is missing or cannot be traversed.
 */
export const resolveFieldPath = (
  payload: NormalizedPlatformEventPayload,
  fieldPath: string,
): unknown => {
  const segments = fieldPath.split('.');

  let current: unknown = payload;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const evaluateCondition = (
  condition: AutomationCondition,
  payload: NormalizedPlatformEventPayload,
): boolean => {
  const actualValue = resolveFieldPath(payload, condition.fieldPath);
  const expectedValue = condition.expectedValue;

  switch (condition.operator) {
    case 'equals':
      return Object.is(actualValue, expectedValue);
    case 'notEquals':
      return !Object.is(actualValue, expectedValue);
    case 'exists':
      return actualValue !== undefined;
    case 'notExists':
      return actualValue === undefined;
    case 'greaterThan':
      return (
        isFiniteNumber(actualValue) && isFiniteNumber(expectedValue) && actualValue > expectedValue
      );
    case 'greaterThanOrEqual':
      return (
        isFiniteNumber(actualValue) && isFiniteNumber(expectedValue) && actualValue >= expectedValue
      );
    case 'lessThan':
      return (
        isFiniteNumber(actualValue) && isFiniteNumber(expectedValue) && actualValue < expectedValue
      );
    case 'lessThanOrEqual':
      return (
        isFiniteNumber(actualValue) && isFiniteNumber(expectedValue) && actualValue <= expectedValue
      );
    case 'contains':
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue.includes(expectedValue);
      }

      if (Array.isArray(actualValue)) {
        return actualValue.some((entry) => Object.is(entry, expectedValue));
      }

      return false;
    case 'in':
      if (!Array.isArray(expectedValue)) {
        return false;
      }

      return expectedValue.some((entry) => Object.is(entry, actualValue));
    default:
      return false;
  }
};

/**
 * Pure deterministic evaluator for automation condition groups.
 */
export class RuleEvaluator {
  evaluateConditionGroup(
    conditionGroup: ConditionGroup,
    payload: NormalizedPlatformEventPayload,
  ): RuleEvaluationResult {
    if (conditionGroup.isEmpty()) {
      return { matched: true, failedConditionIndexes: [] };
    }

    const failedConditionIndexes: number[] = [];

    conditionGroup.conditions.forEach((condition, index) => {
      if (!evaluateCondition(condition, payload)) {
        failedConditionIndexes.push(index);
      }
    });

    if (conditionGroup.mode === 'ALL') {
      return {
        matched: failedConditionIndexes.length === 0,
        failedConditionIndexes,
      };
    }

    const matchedCount = conditionGroup.conditions.length - failedConditionIndexes.length;

    return {
      matched: matchedCount > 0,
      failedConditionIndexes: matchedCount > 0 ? [] : failedConditionIndexes,
    };
  }
}

export const createRuleEvaluator = (): RuleEvaluator => new RuleEvaluator();
