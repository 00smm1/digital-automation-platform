import type { RetryPolicy } from '../automation/retry-policy.js';
import { DEFAULT_RETRY_POLICY } from '../automation/retry-policy.js';

export type WorkflowExecutionPolicy = {
  readonly defaultRetryPolicy: RetryPolicy;
  readonly defaultStepTimeoutMs?: number;
  readonly workflowTimeoutMs?: number;
  readonly allowWorkflowRetry: boolean;
  readonly maxWorkflowRetries: number;
};

export const DEFAULT_WORKFLOW_EXECUTION_POLICY: WorkflowExecutionPolicy = {
  defaultRetryPolicy: DEFAULT_RETRY_POLICY,
  allowWorkflowRetry: false,
  maxWorkflowRetries: 0,
};

export const createWorkflowExecutionPolicy = (
  policy: Partial<WorkflowExecutionPolicy> = {},
): WorkflowExecutionPolicy => ({
  defaultRetryPolicy: policy.defaultRetryPolicy ?? DEFAULT_RETRY_POLICY,
  defaultStepTimeoutMs: policy.defaultStepTimeoutMs,
  workflowTimeoutMs: policy.workflowTimeoutMs,
  allowWorkflowRetry: policy.allowWorkflowRetry ?? false,
  maxWorkflowRetries: policy.maxWorkflowRetries ?? 0,
});
