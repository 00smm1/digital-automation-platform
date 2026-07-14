import type { WorkflowExecutionContext } from '../../domain/workflow/workflow-execution-context.js';
import type { WorkflowStepDefinition } from '../../domain/workflow/workflow-plan.js';

export type WorkflowStepExecutorResult = {
  readonly output?: Readonly<Record<string, unknown>>;
};

/**
 * Executes a single workflow step without transport or infrastructure concerns.
 */
export type WorkflowStepExecutor = (
  context: WorkflowExecutionContext,
  step: WorkflowStepDefinition,
) => Promise<WorkflowStepExecutorResult>;

export type WorkflowStepExecutorRegistry = {
  register(stepType: string, executor: WorkflowStepExecutor): void;
  execute(
    context: WorkflowExecutionContext,
    step: WorkflowStepDefinition,
  ): Promise<WorkflowStepExecutorResult>;
};

export class InMemoryWorkflowStepExecutorRegistry implements WorkflowStepExecutorRegistry {
  private readonly executors = new Map<string, WorkflowStepExecutor>();

  register(stepType: string, executor: WorkflowStepExecutor): void {
    this.executors.set(stepType, executor);
  }

  async execute(
    context: WorkflowExecutionContext,
    step: WorkflowStepDefinition,
  ): Promise<WorkflowStepExecutorResult> {
    const executor = this.executors.get(step.stepType);

    if (executor === undefined) {
      throw new Error(`No workflow step executor registered for type "${step.stepType}".`);
    }

    return executor(context, step);
  }
}
