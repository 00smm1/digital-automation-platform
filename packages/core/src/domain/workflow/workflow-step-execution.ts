export const WORKFLOW_STEP_EXECUTION_STATUSES = [
  'Pending',
  'Running',
  'Succeeded',
  'Failed',
] as const;

export type WorkflowStepExecutionStatus = (typeof WORKFLOW_STEP_EXECUTION_STATUSES)[number];

export type WorkflowStepExecution = {
  readonly stepId: string;
  readonly stepName: string;
  readonly stepType: string;
  readonly status: WorkflowStepExecutionStatus;
  readonly attempts: number;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly durationMs?: number;
  readonly error?: string;
  readonly output?: Readonly<Record<string, unknown>>;
};

export const createWorkflowStepExecution = (params: {
  stepId: string;
  stepName: string;
  stepType: string;
  status?: WorkflowStepExecutionStatus;
  attempts?: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  output?: Readonly<Record<string, unknown>>;
}): WorkflowStepExecution => ({
  stepId: params.stepId,
  stepName: params.stepName,
  stepType: params.stepType,
  status: params.status ?? 'Pending',
  attempts: params.attempts ?? 0,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  durationMs: params.durationMs,
  error: params.error,
  output: params.output,
});
