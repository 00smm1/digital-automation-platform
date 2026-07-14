import { AggregateRoot } from '../entities/aggregate-root.js';
import type { Identifier } from '../../shared/types/identifier.js';
import type { WorkflowExecutionState } from './workflow-execution-state.js';
import { isWorkflowTerminalState } from './workflow-execution-state.js';
import type { WorkflowStepExecution } from './workflow-step-execution.js';
import { WorkflowExecutionHistory } from './workflow-execution-history.js';
import type { WorkflowExecutionMetrics } from './workflow-execution-metrics.js';
import {
  InvalidWorkflowTransitionError,
  WorkflowExecutionError,
  WorkflowImmutableError,
} from './errors/workflow-errors.js';

export type WorkflowExecutionId = Identifier<'WorkflowExecution'>;

const ALLOWED_TRANSITIONS: Readonly<
  Record<WorkflowExecutionState, readonly WorkflowExecutionState[]>
> = {
  Pending: ['Running', 'Cancelled'],
  Running: ['Succeeded', 'Failed', 'Cancelled'],
  Succeeded: [],
  Failed: ['Running'],
  Cancelled: [],
};

/**
 * Aggregate tracking workflow execution state, steps, history, and metrics snapshot.
 */
export class WorkflowExecution extends AggregateRoot<WorkflowExecutionId> {
  private _workflowId: string;
  private _runId: string;
  private _sourcePlanId: string;
  private _state: WorkflowExecutionState;
  private _stepExecutions: WorkflowStepExecution[];
  private readonly _history: WorkflowExecutionHistory;
  private _metrics?: WorkflowExecutionMetrics;
  private readonly _startedAt: Date;
  private _completedAt?: Date;
  private _failureReason?: string;
  private _workflowRetryCount = 0;

  private constructor(
    id: WorkflowExecutionId,
    params: {
      workflowId: string;
      runId: string;
      sourcePlanId: string;
      stepExecutions: WorkflowStepExecution[];
      history: WorkflowExecutionHistory;
      startedAt: Date;
    },
  ) {
    super(id);
    this._workflowId = params.workflowId;
    this._runId = params.runId;
    this._sourcePlanId = params.sourcePlanId;
    this._state = 'Pending';
    this._stepExecutions = params.stepExecutions;
    this._history = params.history;
    this._startedAt = params.startedAt;
  }

  static create(params: {
    id: WorkflowExecutionId;
    workflowId: string;
    runId: string;
    sourcePlanId: string;
    stepExecutions: WorkflowStepExecution[];
    startedAt?: Date;
  }): WorkflowExecution {
    return new WorkflowExecution(params.id, {
      workflowId: params.workflowId,
      runId: params.runId,
      sourcePlanId: params.sourcePlanId,
      stepExecutions: params.stepExecutions,
      history: WorkflowExecutionHistory.create(),
      startedAt: params.startedAt ?? new Date(),
    });
  }

  get workflowId(): string {
    return this._workflowId;
  }

  get runId(): string {
    return this._runId;
  }

  get sourcePlanId(): string {
    return this._sourcePlanId;
  }

  get state(): WorkflowExecutionState {
    return this._state;
  }

  get stepExecutions(): readonly WorkflowStepExecution[] {
    return this._stepExecutions;
  }

  get history(): WorkflowExecutionHistory {
    return this._history;
  }

  get metrics(): WorkflowExecutionMetrics | undefined {
    return this._metrics;
  }

  get startedAt(): Date {
    return this._startedAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get failureReason(): string | undefined {
    return this._failureReason;
  }

  get workflowRetryCount(): number {
    return this._workflowRetryCount;
  }

  assertMutable(): void {
    if (this._state === 'Succeeded') {
      throw new WorkflowImmutableError(this._id, this._state);
    }

    if (this._state === 'Cancelled') {
      throw new WorkflowImmutableError(this._id, this._state);
    }
  }

  transitionTo(targetState: WorkflowExecutionState): void {
    const allowed = ALLOWED_TRANSITIONS[this._state];

    if (!allowed.includes(targetState)) {
      throw new InvalidWorkflowTransitionError(this._id, this._state, targetState);
    }

    this._state = targetState;

    if (isWorkflowTerminalState(targetState)) {
      this._completedAt = new Date();
    }
  }

  markRunning(): void {
    this.assertMutable();
    this.transitionTo('Running');
  }

  markSucceeded(metrics: WorkflowExecutionMetrics): void {
    this.assertMutable();
    this.transitionTo('Succeeded');
    this._metrics = metrics;
    this._failureReason = undefined;
  }

  markFailed(metrics: WorkflowExecutionMetrics, failureReason: string): void {
    this.assertMutable();
    this.transitionTo('Failed');
    this._metrics = metrics;
    this._failureReason = failureReason;
  }

  markCancelled(metrics: WorkflowExecutionMetrics): void {
    if (this._state === 'Succeeded') {
      throw new WorkflowImmutableError(this._id, this._state);
    }

    if (this._state === 'Cancelled') {
      return;
    }

    this.transitionTo('Cancelled');
    this._metrics = metrics;
  }

  retryWorkflow(): void {
    if (this._state !== 'Failed') {
      throw new InvalidWorkflowTransitionError(this._id, this._state, 'Running');
    }

    this._workflowRetryCount += 1;
    this._state = 'Running';
    this._completedAt = undefined;
    this._failureReason = undefined;
    this._stepExecutions = this._stepExecutions.map((step) => ({
      ...step,
      status: 'Pending',
      attempts: 0,
      startedAt: undefined,
      completedAt: undefined,
      durationMs: undefined,
      error: undefined,
      output: undefined,
    }));
  }

  updateStepExecution(stepExecution: WorkflowStepExecution): void {
    this.assertMutable();

    const index = this._stepExecutions.findIndex((step) => step.stepId === stepExecution.stepId);

    if (index === -1) {
      throw new WorkflowExecutionError(`Step "${stepExecution.stepId}" was not found.`, this._id);
    }

    this._stepExecutions = [
      ...this._stepExecutions.slice(0, index),
      stepExecution,
      ...this._stepExecutions.slice(index + 1),
    ];
  }
}
