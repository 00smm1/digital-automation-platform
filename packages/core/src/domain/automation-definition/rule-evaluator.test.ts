import { describe, expect, it } from 'vitest';

import { AutomationCondition } from './automation-condition.js';
import { ConditionGroup } from './condition-group.js';
import { RuleEvaluator, resolveFieldPath } from './rule-evaluator.js';
import type { NormalizedPlatformEventPayload } from './normalized-platform-event.js';

const payload: NormalizedPlatformEventPayload = {
  order: { status: 'paid', total: 100 },
  product: { type: 'lord-tv-premium', tags: ['premium', 'iptv'] },
  customer: { country: 'SA' },
};

describe('resolveFieldPath', () => {
  it('resolves nested field paths', () => {
    expect(resolveFieldPath(payload, 'product.type')).toBe('lord-tv-premium');
    expect(resolveFieldPath(payload, 'order.status')).toBe('paid');
  });

  it('returns undefined for missing fields without throwing', () => {
    expect(resolveFieldPath(payload, 'product.missing')).toBeUndefined();
    expect(resolveFieldPath(payload, 'missing.path.value')).toBeUndefined();
  });
});

describe('RuleEvaluator', () => {
  const evaluator = new RuleEvaluator();

  it('evaluates equals and notEquals', () => {
    const group = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'equals',
          expectedValue: 'lord-tv-premium',
        }),
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'notEquals',
          expectedValue: 'other',
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(group, payload).matched).toBe(true);
  });

  it('evaluates exists and notExists', () => {
    const existsGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({ fieldPath: 'customer.country', operator: 'exists' }),
      ],
    });
    const notExistsGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({ fieldPath: 'customer.missing', operator: 'notExists' }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(existsGroup, payload).matched).toBe(true);
    expect(evaluator.evaluateConditionGroup(notExistsGroup, payload).matched).toBe(true);
  });

  it('evaluates numeric comparisons with finite numbers only', () => {
    const passGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'order.total',
          operator: 'greaterThanOrEqual',
          expectedValue: 100,
        }),
        AutomationCondition.create({
          fieldPath: 'order.total',
          operator: 'lessThanOrEqual',
          expectedValue: 100,
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(passGroup, payload).matched).toBe(true);

    const failGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'order.status',
          operator: 'greaterThan',
          expectedValue: 1,
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(failGroup, payload).matched).toBe(false);
  });

  it('does not coerce strings to numbers', () => {
    const stringPayload: NormalizedPlatformEventPayload = { value: '10' };
    const group = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'value',
          operator: 'greaterThan',
          expectedValue: 2,
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(group, stringPayload).matched).toBe(false);
  });

  it('evaluates contains for strings and arrays', () => {
    const stringGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'contains',
          expectedValue: 'premium',
        }),
      ],
    });
    const arrayGroup = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'product.tags',
          operator: 'contains',
          expectedValue: 'iptv',
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(stringGroup, payload).matched).toBe(true);
    expect(evaluator.evaluateConditionGroup(arrayGroup, payload).matched).toBe(true);
  });

  it('evaluates in with array expected values', () => {
    const group = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'in',
          expectedValue: ['lord-tv-premium', 'lord-tv-basic'],
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(group, payload).matched).toBe(true);
  });

  it('evaluates ALL condition groups', () => {
    const group = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'equals',
          expectedValue: 'lord-tv-premium',
        }),
        AutomationCondition.create({
          fieldPath: 'order.status',
          operator: 'equals',
          expectedValue: 'failed',
        }),
      ],
    });

    const result = evaluator.evaluateConditionGroup(group, payload);

    expect(result.matched).toBe(false);
    expect(result.failedConditionIndexes).toEqual([1]);
  });

  it('evaluates ANY condition groups', () => {
    const group = ConditionGroup.create({
      mode: 'ANY',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'order.status',
          operator: 'equals',
          expectedValue: 'failed',
        }),
        AutomationCondition.create({
          fieldPath: 'product.type',
          operator: 'equals',
          expectedValue: 'lord-tv-premium',
        }),
      ],
    });

    expect(evaluator.evaluateConditionGroup(group, payload).matched).toBe(true);
  });

  it('treats empty condition groups as matched', () => {
    const group = ConditionGroup.create({ mode: 'ANY', conditions: [] });

    expect(evaluator.evaluateConditionGroup(group, payload).matched).toBe(true);
  });

  it('does not mutate the payload', () => {
    const frozenPayload = { ...payload, nested: { value: 1 } };
    const group = ConditionGroup.create({
      mode: 'ALL',
      conditions: [
        AutomationCondition.create({
          fieldPath: 'nested.value',
          operator: 'equals',
          expectedValue: 1,
        }),
      ],
    });

    evaluator.evaluateConditionGroup(group, frozenPayload);

    expect(frozenPayload).toEqual({ ...payload, nested: { value: 1 } });
  });
});
