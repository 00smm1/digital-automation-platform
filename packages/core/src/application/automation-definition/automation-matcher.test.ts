import { describe, expect, it } from 'vitest';

import { AutomationMatcher } from './automation-matcher.js';
import { AutomationDefinition } from '../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../domain/automation-definition/condition-group.js';
import { InMemoryAutomationDefinitionRepository } from '../../domain/automation-definition/in-memory-automation-definition-repository.js';
import { createNormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import { createIdentifier } from '../../shared/types/identifier.js';

const createMatcher = () => {
  const repository = new InMemoryAutomationDefinitionRepository();
  const matcher = new AutomationMatcher({ repository });
  return { repository, matcher };
};

const createDefinition = (params: {
  id: string;
  eventType: string;
  workflowReference: string;
  priority: number;
  enabled?: boolean;
  conditions?: ConditionGroup;
}) =>
  AutomationDefinition.create({
    id: createIdentifier('AutomationDefinition', params.id),
    name: params.id,
    trigger: AutomationTrigger.create(params.eventType),
    workflowReference: params.workflowReference,
    priority: params.priority,
    status: params.enabled === false ? 'disabled' : 'enabled',
    conditions: params.conditions,
  });

describe('AutomationMatcher', () => {
  it('matches enabled automations by trigger and conditions', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'lord-tv-premium',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-premium-delivery',
        priority: 100,
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
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date('2026-07-19T00:00:00.000Z'),
        payload: {
          order: { id: 'order-1', status: 'paid' },
          product: { type: 'lord-tv-premium' },
          customer: { id: 'customer-1' },
        },
      }),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.workflowReference).toBe('lord-tv-premium-delivery');
  });

  it('excludes trigger mismatches', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'auto-1',
        eventType: 'order.refunded',
        workflowReference: 'workflow-1',
        priority: 1,
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: {},
      }),
    );

    expect(matches).toHaveLength(0);
  });

  it('excludes disabled automations', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'auto-disabled',
        eventType: 'order.paid',
        workflowReference: 'workflow-1',
        priority: 1,
        enabled: false,
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: {},
      }),
    );

    expect(matches).toHaveLength(0);
  });

  it('excludes automations when conditions fail', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'auto-fail',
        eventType: 'order.paid',
        workflowReference: 'workflow-1',
        priority: 1,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'other-product',
            }),
          ],
        }),
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: { product: { type: 'lord-tv-premium' } },
      }),
    );

    expect(matches).toHaveLength(0);
  });

  it('returns multiple matches ordered by priority desc then id asc', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'z-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-z',
        priority: 10,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'a-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-a',
        priority: 100,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'm-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-m',
        priority: 100,
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: {},
      }),
    );

    expect(matches.map((item) => item.id)).toEqual([
      createIdentifier('AutomationDefinition', 'a-auto'),
      createIdentifier('AutomationDefinition', 'm-auto'),
      createIdentifier('AutomationDefinition', 'z-auto'),
    ]);
  });

  it('applies final ordering even when repository order differs', async () => {
    const repository = new InMemoryAutomationDefinitionRepository();
    const matcher = new AutomationMatcher({ repository });

    await repository.save(
      createDefinition({
        id: 'low-priority',
        eventType: 'order.paid',
        workflowReference: 'workflow-low',
        priority: 1,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'high-priority',
        eventType: 'order.paid',
        workflowReference: 'workflow-high',
        priority: 50,
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: {},
      }),
    );

    expect(matches[0]?.id).toBe(createIdentifier('AutomationDefinition', 'high-priority'));
  });

  it('matches trigger-only automations with no conditions', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'catch-all',
        eventType: 'order.paid',
        workflowReference: 'workflow-catch-all',
        priority: 1,
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.paid',
        occurredAt: new Date(),
        payload: { product: { type: 'anything' } },
      }),
    );

    expect(matches).toHaveLength(1);
  });
});

describe('AutomationMatcher application flow', () => {
  it('selects lord-tv-premium-delivery from a synthetic order.paid event', async () => {
    const { repository, matcher } = createMatcher();

    await repository.save(
      createDefinition({
        id: 'lord-tv-basic',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-basic-delivery',
        priority: 10,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'lord-tv-basic',
            }),
          ],
        }),
      }),
    );

    await repository.save(
      createDefinition({
        id: 'lord-tv-premium',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-premium-delivery',
        priority: 20,
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
      }),
    );

    const matches = await matcher.match(
      createNormalizedPlatformEvent({
        eventId: 'evt-order-paid-001',
        eventType: 'order.paid',
        occurredAt: new Date('2026-07-19T10:00:00.000Z'),
        payload: {
          order: { id: 'order-1001', status: 'paid' },
          product: { type: 'lord-tv-premium', sku: 'LTV-PREM-12M' },
          customer: { id: 'customer-42', country: 'SA' },
        },
      }),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.workflowReference).toBe('lord-tv-premium-delivery');
    expect(matches[0]?.priority).toBe(20);
  });
});
