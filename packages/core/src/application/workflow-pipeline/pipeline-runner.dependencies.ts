import type { PipelineStepExecutorRegistry } from './pipeline-step-executor.js';
import type { PipelineExecutionProgressObserver } from '../execution-run/pipeline-execution-progress-observer.js';
import type { Clock } from '../../shared/time/clock.js';

export type PipelineRunnerDependencies = {
  readonly stepExecutorRegistry: PipelineStepExecutorRegistry;
  readonly progressObserver?: PipelineExecutionProgressObserver;
  readonly clock?: Clock;
};
