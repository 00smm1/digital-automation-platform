import type { WorkflowDefinition } from './workflow-definition.js';

export type WorkflowDefinitionRepository = {
  findByReference(reference: string): Promise<WorkflowDefinition | null>;
  save(definition: WorkflowDefinition): Promise<void>;
};
