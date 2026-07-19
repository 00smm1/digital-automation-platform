import type { AutomationDefinition, AutomationDefinitionId } from './automation-definition.js';

/**
 * Persistence contract for automation definitions.
 *
 * `save` replaces any existing definition with the same id (upsert semantics).
 * `findEnabledByEventType` returns enabled definitions in ascending priority, then id order.
 */
export interface AutomationDefinitionRepository {
  save(definition: AutomationDefinition): Promise<void>;

  findById(id: AutomationDefinitionId): Promise<AutomationDefinition | null>;

  findEnabledByEventType(eventType: string): Promise<readonly AutomationDefinition[]>;

  findAll(): Promise<readonly AutomationDefinition[]>;
}
