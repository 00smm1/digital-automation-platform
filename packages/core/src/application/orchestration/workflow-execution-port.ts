import type { WorkflowExecutionRequest } from '../../domain/orchestration/workflow-execution-request.js';
import type { WorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';

/**
 * Application port for invoking workflow execution without coupling to a concrete runtime.
 */
export interface WorkflowExecutionPort {
  execute(request: WorkflowExecutionRequest): Promise<WorkflowExecutionOutcome>;
}
