import { describe, expect, it } from 'vitest';

import { createIdentifier } from '../../shared/types/identifier.js';
import { AutomationDefinition } from './automation-definition.js';
import { AutomationTrigger } from './automation-trigger.js';
import { InMemoryAutomationDefinitionRepository } from './in-memory-automation-definition-repository.js';

const createDefinition = (params: {
  id: string;
  eventType: string;
  priority: number;
  enabled?: boolean;
}) => {
  const definition = AutomationDefinition.create({
    id: createIdentifier('AutomationDefinition', params.id),
    name: params.id,
    trigger: AutomationTrigger.create(params.eventType),
    workflowReference: `workflow-${params.id}`,
    priority: params.priority,
    status: params.enabled === false ? 'disabled' : 'enabled',
  });

  return definition;
};

describe('InMemoryAutomationDefinitionRepository', () => {
  it('saves and finds definitions by id', async () => {
    const repository = new InMemoryAutomationDefinitionRepository();
    const definition = createDefinition({ id: 'auto-1', eventType: 'order.paid', priority: 1 });

    await repository.save(definition);

    const found = await repository.findById(definition.id);

    expect(found?.id).toBe(definition.id);
    expect(found?.name).toBe(definition.name);
  });

  it('replaces an existing definition with the same id', async () => {
    const repository = new InMemoryAutomationDefinitionRepository();
    const definition = createDefinition({ id: 'auto-1', eventType: 'order.paid', priority: 1 });

    await repository.save(definition);
    definition.disable();
    await repository.save(definition);

    const found = await repository.findById(definition.id);

    expect(found?.isEnabled()).toBe(false);
  });

  it('returns enabled definitions for an event type in deterministic order', async () => {
    const repository = new InMemoryAutomationDefinitionRepository();
    const first = createDefinition({ id: 'b-auto', eventType: 'order.paid', priority: 10 });
    const second = createDefinition({ id: 'a-auto', eventType: 'order.paid', priority: 10 });
    const disabled = createDefinition({
      id: 'disabled-auto',
      eventType: 'order.paid',
      priority: 100,
      enabled: false,
    });
    const otherEvent = createDefinition({
      id: 'other-auto',
      eventType: 'order.refunded',
      priority: 50,
    });

    await repository.save(first);
    await repository.save(second);
    await repository.save(disabled);
    await repository.save(otherEvent);

    const results = await repository.findEnabledByEventType('order.paid');

    expect(results.map((item) => item.id)).toEqual([
      createIdentifier('AutomationDefinition', 'a-auto'),
      createIdentifier('AutomationDefinition', 'b-auto'),
    ]);
  });

  it('isolates state between repository instances', async () => {
    const firstRepository = new InMemoryAutomationDefinitionRepository();
    const secondRepository = new InMemoryAutomationDefinitionRepository();
    const definition = createDefinition({ id: 'auto-1', eventType: 'order.paid', priority: 1 });

    await firstRepository.save(definition);

    expect(await secondRepository.findById(definition.id)).toBeNull();
    expect(await firstRepository.findById(definition.id)).not.toBeNull();
  });
});
