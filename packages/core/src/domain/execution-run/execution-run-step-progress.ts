export const EXECUTION_RUN_STEP_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
] as const;

export type ExecutionRunStepStatus = (typeof EXECUTION_RUN_STEP_STATUSES)[number];

export type ExecutionRunStepProgress = {
  readonly stepId: string;
  readonly stepName: string;
  readonly executionOrder: number;
  readonly status: ExecutionRunStepStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly safeOutcomeMetadata?: Readonly<Record<string, unknown>>;
  readonly failureCode?: string;
  readonly failureReason?: string;
};

export const createExecutionRunStepProgress = (
  params: ExecutionRunStepProgress,
): ExecutionRunStepProgress => ({
  stepId: params.stepId,
  stepName: params.stepName,
  executionOrder: params.executionOrder,
  status: params.status,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  safeOutcomeMetadata:
    params.safeOutcomeMetadata === undefined ? undefined : { ...params.safeOutcomeMetadata },
  failureCode: params.failureCode,
  failureReason: params.failureReason,
});
