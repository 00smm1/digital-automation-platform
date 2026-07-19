import { AutomationDefinition } from './automation-definition.js';
import type { AutomationDefinitionId } from './automation-definition.js';
import type { AutomationDefinitionRepository } from './automation-definition-repository.js';

const cloneDefinition = (definition: AutomationDefinition): AutomationDefinition => {
  return AutomationDefinition.restore(definition.id, definition.toProps());
};

const compareDefinitions = (left: AutomationDefinition, right: AutomationDefinition): number => {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.id.localeCompare(right.id);
};

/**
 * In-memory automation definition repository for tests and local composition.
 */
export class InMemoryAutomationDefinitionRepository implements AutomationDefinitionRepository {
  private readonly definitions = new Map<AutomationDefinitionId, AutomationDefinition>();

  async save(definition: AutomationDefinition): Promise<void> {
    this.definitions.set(definition.id, cloneDefinition(definition));
  }

  async findById(id: AutomationDefinitionId): Promise<AutomationDefinition | null> {
    const definition = this.definitions.get(id);
    return definition ? cloneDefinition(definition) : null;
  }

  async findEnabledByEventType(eventType: string): Promise<readonly AutomationDefinition[]> {
    return [...this.definitions.values()]
      .filter((definition) => definition.isEnabled() && definition.trigger.matches(eventType))
      .sort(compareDefinitions)
      .map((definition) => cloneDefinition(definition));
  }

  async findAll(): Promise<readonly AutomationDefinition[]> {
    return [...this.definitions.values()]
      .sort(compareDefinitions)
      .map((definition) => cloneDefinition(definition));
  }
}
