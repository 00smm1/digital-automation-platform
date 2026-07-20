import type { AutomationMatcher } from '../automation-definition/automation-matcher.js';
import type { WorkflowExecutionPort } from './workflow-execution-port.js';
import type { WorkflowExecutionIdGenerator } from '../../domain/orchestration/workflow-execution-request.js';
import type { ExecutionRunLifecyclePort } from '../execution-run/execution-run-lifecycle-port.js';

export type PlatformEventOrchestratorDependencies = {
  readonly matcher: AutomationMatcher;
  readonly workflowExecutionPort: WorkflowExecutionPort;
  readonly executionIdGenerator?: WorkflowExecutionIdGenerator;
  readonly executionRunLifecyclePort?: ExecutionRunLifecyclePort;
};
