/**
 * Execution metrics collected independently from step business logic.
 */
export type WorkflowExecutionMetrics = {
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly retriedAttempts: number;
  readonly cancelled: boolean;
  readonly totalDurationMs: number;
  readonly stepDurationsMs: Readonly<Record<string, number>>;
};

export const createEmptyWorkflowExecutionMetrics = (
  totalSteps: number,
): WorkflowExecutionMetrics => ({
  totalSteps,
  completedSteps: 0,
  failedSteps: 0,
  retriedAttempts: 0,
  cancelled: false,
  totalDurationMs: 0,
  stepDurationsMs: {},
});

/**
 * Records workflow metrics without coupling to business logic.
 */
export class WorkflowExecutionMetricsRecorder {
  private totalSteps: number;
  private completedSteps = 0;
  private failedSteps = 0;
  private retriedAttempts = 0;
  private cancelled = false;
  private startedAt?: Date;
  private completedAt?: Date;
  private readonly stepDurationsMs: Record<string, number> = {};

  constructor(totalSteps: number) {
    this.totalSteps = totalSteps;
  }

  markStarted(startedAt: Date): void {
    this.startedAt = startedAt;
  }

  markCompleted(completedAt: Date): void {
    this.completedAt = completedAt;
  }

  recordStepCompleted(stepId: string, durationMs: number): void {
    this.completedSteps += 1;
    this.stepDurationsMs[stepId] = durationMs;
  }

  recordStepFailed(stepId: string, durationMs: number): void {
    this.failedSteps += 1;
    this.stepDurationsMs[stepId] = durationMs;
  }

  recordRetryAttempt(): void {
    this.retriedAttempts += 1;
  }

  markCancelled(): void {
    this.cancelled = true;
  }

  snapshot(): WorkflowExecutionMetrics {
    const totalDurationMs =
      this.startedAt !== undefined && this.completedAt !== undefined
        ? this.completedAt.getTime() - this.startedAt.getTime()
        : 0;

    return {
      totalSteps: this.totalSteps,
      completedSteps: this.completedSteps,
      failedSteps: this.failedSteps,
      retriedAttempts: this.retriedAttempts,
      cancelled: this.cancelled,
      totalDurationMs,
      stepDurationsMs: { ...this.stepDurationsMs },
    };
  }
}
