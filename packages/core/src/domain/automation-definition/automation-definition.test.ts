import { describe, expect, it } from 'vitest';

import { createIdentifier } from '../../shared/types/identifier.js';
import { AutomationDefinition } from './automation-definition.js';
import { AutomationTrigger } from './automation-trigger.js';
import { ConditionGroup } from './condition-group.js';
import { AutomationCondition } from './automation-condition.js';
import {
  InvalidAutomationDefinitionError,
  InvalidAutomationPriorityError,
  InvalidAutomationWorkflowReferenceError,
} from './errors/automation-definition-errors.js';
import { InvalidAutomationTriggerError } from './errors/automation-definition-errors.js';

const createDefinition = () =>
  AutomationDefinition.create({
    id: createIdentifier('AutomationDefinition', 'auto-1'),
    name: 'Lord TV Premium Delivery',
    trigger: AutomationTrigger.create('order.paid'),
    workflowReference: 'lord-tv-premium-delivery',
    priority: 100,
  });

describe('AutomationDefinition', () => {
  it('creates a valid definition', () => {
    const definition = createDefinition();

    expect(definition.name).toBe('Lord TV Premium Delivery');
    expect(definition.trigger.eventType).toBe('order.paid');
    expect(definition.workflowReference).toBe('lord-tv-premium-delivery');
    expect(definition.priority).toBe(100);
    expect(definition.isEnabled()).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(() =>
      AutomationDefinition.create({
        id: createIdentifier('AutomationDefinition', 'auto-empty-name'),
        name: '   ',
        trigger: AutomationTrigger.create('order.paid'),
        workflowReference: 'workflow-1',
      }),
    ).toThrow(InvalidAutomationDefinitionError);
  });

  it('rejects an empty trigger event type', () => {
    expect(() => AutomationTrigger.create('  ')).toThrow(InvalidAutomationTriggerError);
  });

  it('rejects an empty workflow reference', () => {
    expect(() =>
      AutomationDefinition.create({
        id: createIdentifier('AutomationDefinition', 'auto-empty-workflow'),
        name: 'Test',
        trigger: AutomationTrigger.create('order.paid'),
        workflowReference: '  ',
      }),
    ).toThrow(InvalidAutomationWorkflowReferenceError);
  });

  it('rejects an invalid priority', () => {
    expect(() =>
      AutomationDefinition.create({
        id: createIdentifier('AutomationDefinition', 'auto-bad-priority'),
        name: 'Test',
        trigger: AutomationTrigger.create('order.paid'),
        workflowReference: 'workflow-1',
        priority: 1.5,
      }),
    ).toThrow(InvalidAutomationPriorityError);
  });

  it('supports enabled and disabled status', () => {
    const definition = createDefinition();

    definition.disable();
    expect(definition.isEnabled()).toBe(false);
    expect(definition.status).toBe('disabled');

    definition.enable();
    expect(definition.isEnabled()).toBe(true);
    expect(definition.status).toBe('enabled');
  });

  it('stores condition groups', () => {
    const definition = AutomationDefinition.create({
      id: createIdentifier('AutomationDefinition', 'auto-conditions'),
      name: 'Conditional',
      trigger: AutomationTrigger.create('order.paid'),
      workflowReference: 'workflow-1',
      conditions: ConditionGroup.create({
        mode: 'ALL',
        conditions: [
          AutomationCondition.create({
            fieldPath: 'product.type',
            operator: 'equals',
            expectedValue: 'lord-tv-premium',
          }),
        ],
      }),
    });

    expect(definition.conditions.conditions).toHaveLength(1);
  });
});
