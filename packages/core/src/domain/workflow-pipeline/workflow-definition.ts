import type { Identifier } from '../../shared/types/identifier.js';
import type { PipelineStepDefinition } from './pipeline-step-definition.js';
import {
  InvalidWorkflowDefinitionError,
  InvalidWorkflowStepDefinitionError,
} from './errors/workflow-pipeline-errors.js';

export type WorkflowDefinitionId = Identifier<'WorkflowDefinition'>;

export type WorkflowDefinitionProps = {
  readonly name: string;
  readonly steps: readonly PipelineStepDefinition[];
};

/**
 * Provider-independent declarative workflow composed of ordered pipeline steps.
 */
export class WorkflowDefinition {
  readonly id: WorkflowDefinitionId;
  readonly name: string;
  readonly steps: readonly PipelineStepDefinition[];

  private constructor(id: WorkflowDefinitionId, props: WorkflowDefinitionProps) {
    this.id = id;
    this.name = props.name;
    this.steps = props.steps;
  }

  static create(params: {
    id: WorkflowDefinitionId;
    name: string;
    steps?: readonly PipelineStepDefinition[];
  }): WorkflowDefinition {
    const name = params.name.trim();

    if (name.length === 0) {
      throw new InvalidWorkflowDefinitionError('Workflow definition name must not be empty.');
    }

    const steps = params.steps ?? [];
    validateSteps(steps);

    return new WorkflowDefinition(params.id, {
      name,
      steps: steps.map((step) => ({
        ...step,
        payload: { ...step.payload },
      })),
    });
  }
}

const validateSteps = (steps: readonly PipelineStepDefinition[]): void => {
  const stepIds = new Set<string>();
  const stepNames = new Set<string>();

  for (const step of steps) {
    const name = step.name.trim();
    const stepType = step.stepType.trim();

    if (name.length === 0) {
      throw new InvalidWorkflowStepDefinitionError('Pipeline step name must not be empty.');
    }

    if (stepType.length === 0) {
      throw new InvalidWorkflowStepDefinitionError('Pipeline step type must not be empty.');
    }

    if (stepIds.has(step.id)) {
      throw new InvalidWorkflowStepDefinitionError(`Duplicate pipeline step id "${step.id}".`);
    }

    if (stepNames.has(name)) {
      throw new InvalidWorkflowStepDefinitionError(`Duplicate pipeline step name "${name}".`);
    }

    stepIds.add(step.id);
    stepNames.add(name);
  }
};
