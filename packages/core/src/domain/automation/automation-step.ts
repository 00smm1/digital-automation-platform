import type { AutomationContext } from './automation-context.js';

export type StepExecutionStatus = 'success' | 'skipped' | 'failed';

/**
 * Outcome of a single automation step execution.
 */
export type StepResult = {
  readonly stepName: string;
  readonly status: StepExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly attempts: number;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: string;
};

/**
 * Contract for one step in an automation pipeline.
 */
export interface AutomationStep {
  readonly stepName: string;
  execute(context: AutomationContext): Promise<StepResult>;
}
