import type { PipelineStepExecutorRegistry } from './pipeline-step-executor.js';

export type PipelineRunnerDependencies = {
  readonly stepExecutorRegistry: PipelineStepExecutorRegistry;
};
