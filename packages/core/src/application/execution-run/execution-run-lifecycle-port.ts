import type { Result } from '../../shared/types/result.js';
import type { ExecutionRunId } from '../../domain/execution-run/execution-run-id.js';
import type { ExecutionRunLifecycleError } from '../../domain/execution-run/errors/execution-run-errors.js';

export type ExecutionRunLifecyclePort = {
  onAutomationsMatched(params: {
    executionRunId: ExecutionRunId;
    matchedAutomations: readonly {
      readonly automationId: string;
      readonly workflowId: string;
    }[];
  }): Promise<Result<void, ExecutionRunLifecycleError>>;
};
