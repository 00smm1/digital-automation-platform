import type { Identifier } from '../../shared/types/identifier.js';

export type PipelineStepId = Identifier<'PipelineStep'>;

/**
 * Declarative step within a workflow definition.
 */
export type PipelineStepDefinition = {
  readonly id: PipelineStepId;
  readonly name: string;
  readonly stepType: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export const createPipelineStepDefinition = (
  params: PipelineStepDefinition,
): PipelineStepDefinition => ({
  id: params.id,
  name: params.name,
  stepType: params.stepType,
  payload: { ...params.payload },
});
