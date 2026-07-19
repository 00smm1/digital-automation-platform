import type { WorkflowDefinition } from './workflow-definition.js';
import type { WorkflowDefinitionRepository } from './workflow-definition-repository.js';

/**
 * In-memory workflow definition repository for tests and local composition.
 */
export class InMemoryWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  private readonly definitions = new Map<string, WorkflowDefinition>();

  async save(definition: WorkflowDefinition): Promise<void> {
    this.definitions.set(definition.id, definition);
  }

  async findByReference(reference: string): Promise<WorkflowDefinition | null> {
    return this.definitions.get(reference) ?? null;
  }
}
