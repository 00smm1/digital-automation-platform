import { describe, expect, it } from 'vitest';

import { WorkflowDefinition } from './workflow-definition.js';
import { createPipelineStepDefinition } from './pipeline-step-definition.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import {
  InvalidWorkflowDefinitionError,
  InvalidWorkflowStepDefinitionError,
} from './errors/workflow-pipeline-errors.js';

const createStep = (params: { id: string; name: string; stepType: string }) =>
  createPipelineStepDefinition({
    id: createIdentifier('PipelineStep', params.id),
    name: params.name,
    stepType: params.stepType,
    payload: {},
  });

describe('WorkflowDefinition', () => {
  it('creates a workflow with ordered steps', () => {
    const definition = WorkflowDefinition.create({
      id: createIdentifier('WorkflowDefinition', 'wf-1'),
      name: 'Delivery Workflow',
      steps: [
        createStep({ id: 'step-1', name: 'Reserve Inventory', stepType: 'inventory.reserve' }),
        createStep({ id: 'step-2', name: 'Provision Service', stepType: 'provider.provision' }),
      ],
    });

    expect(definition.name).toBe('Delivery Workflow');
    expect(definition.steps).toHaveLength(2);
    expect(definition.steps[0]?.stepType).toBe('inventory.reserve');
  });

  it('allows an empty workflow definition', () => {
    const definition = WorkflowDefinition.create({
      id: createIdentifier('WorkflowDefinition', 'wf-empty'),
      name: 'Empty Workflow',
      steps: [],
    });

    expect(definition.steps).toHaveLength(0);
  });

  it('rejects an empty workflow name', () => {
    expect(() =>
      WorkflowDefinition.create({
        id: createIdentifier('WorkflowDefinition', 'wf-1'),
        name: '   ',
      }),
    ).toThrow(InvalidWorkflowDefinitionError);
  });

  it('rejects duplicate step ids', () => {
    expect(() =>
      WorkflowDefinition.create({
        id: createIdentifier('WorkflowDefinition', 'wf-1'),
        name: 'Workflow',
        steps: [
          createStep({ id: 'step-1', name: 'First', stepType: 'a' }),
          createStep({ id: 'step-1', name: 'Second', stepType: 'b' }),
        ],
      }),
    ).toThrow(InvalidWorkflowStepDefinitionError);
  });

  it('rejects duplicate step names', () => {
    expect(() =>
      WorkflowDefinition.create({
        id: createIdentifier('WorkflowDefinition', 'wf-1'),
        name: 'Workflow',
        steps: [
          createStep({ id: 'step-1', name: 'Same Name', stepType: 'a' }),
          createStep({ id: 'step-2', name: 'Same Name', stepType: 'b' }),
        ],
      }),
    ).toThrow(InvalidWorkflowStepDefinitionError);
  });
});
