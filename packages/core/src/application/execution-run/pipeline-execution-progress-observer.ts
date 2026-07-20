import type { Result } from '../../shared/types/result.js';
import type { ExecutionRunId } from '../../domain/execution-run/execution-run-id.js';
import type { ExecutionRunLifecycleError } from '../../domain/execution-run/errors/execution-run-errors.js';

export type PipelineExecutionProgressObserver = {
  onStepStarted(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
  }): Promise<Result<void, ExecutionRunLifecycleError>>;

  onStepCompleted(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
    safeOutcomeMetadata?: Readonly<Record<string, unknown>>;
  }): Promise<Result<void, ExecutionRunLifecycleError>>;

  onStepFailed(params: {
    executionRunId: ExecutionRunId;
    stepId: string;
    stepName: string;
    executionOrder: number;
    failureCode?: string;
    failureReason?: string;
  }): Promise<Result<void, ExecutionRunLifecycleError>>;

  onStepsSkipped(params: {
    executionRunId: ExecutionRunId;
    steps: readonly {
      readonly stepId: string;
      readonly stepName: string;
      readonly executionOrder: number;
    }[];
  }): Promise<Result<void, ExecutionRunLifecycleError>>;
};
