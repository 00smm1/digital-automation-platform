export type ExecutionRunOutcomeSummary = {
  readonly orchestrationStatus: string;
  readonly matchedAutomationCount: number;
  readonly successfulExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly completedStepCount: number;
  readonly failedStepName?: string;
};

export const createExecutionRunOutcomeSummary = (
  params: ExecutionRunOutcomeSummary,
): ExecutionRunOutcomeSummary => params;
