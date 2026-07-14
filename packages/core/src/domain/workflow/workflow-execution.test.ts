import { describe, expect, it } from 'vitest';

import { createIdentifier } from '../../shared/types/identifier.js';
import { WorkflowExecution } from './workflow-execution.js';
import { createWorkflowStepExecution } from './workflow-step-execution.js';
import { WorkflowExecutionHistory } from './workflow-execution-history.js';
import { createEmptyWorkflowExecutionMetrics } from './workflow-execution-metrics.js';
import {
  InvalidWorkflowTransitionError,
  WorkflowImmutableError,
} from './errors/workflow-errors.js';

const createExecution = () =>
  WorkflowExecution.create({
    id: createIdentifier('WorkflowExecution', 'exec-1'),
    workflowId: 'workflow-1',
    runId: 'run-1',
    sourcePlanId: 'plan-1',
    stepExecutions: [
      createWorkflowStepExecution({
        stepId: 'step-1',
        stepName: 'step-one',
        stepType: 'test',
      }),
    ],
  });

describe('WorkflowExecution', () => {
  it('transitions from Pending to Running to Succeeded', () => {
    const execution = createExecution();
    const metrics = createEmptyWorkflowExecutionMetrics(1);

    execution.markRunning();
    expect(execution.state).toBe('Running');

    execution.markSucceeded(metrics);
    expect(execution.state).toBe('Succeeded');
    expect(execution.metrics).toEqual(metrics);
  });

  it('prevents mutating succeeded workflows', () => {
    const execution = createExecution();
    execution.markRunning();
    execution.markSucceeded(createEmptyWorkflowExecutionMetrics(1));

    expect(() => execution.markRunning()).toThrow(WorkflowImmutableError);
    expect(() => execution.markFailed(createEmptyWorkflowExecutionMetrics(1), 'fail')).toThrow(
      WorkflowImmutableError,
    );
  });

  it('prevents continuing cancelled workflows', () => {
    const execution = createExecution();
    execution.markRunning();
    execution.markCancelled(createEmptyWorkflowExecutionMetrics(1));

    expect(() =>
      execution.updateStepExecution(
        createWorkflowStepExecution({
          stepId: 'step-1',
          stepName: 'step-one',
          stepType: 'test',
          status: 'Running',
        }),
      ),
    ).toThrow(WorkflowImmutableError);
  });

  it('allows failed workflows to retry through policy-controlled transition', () => {
    const execution = createExecution();
    execution.markRunning();
    execution.markFailed(createEmptyWorkflowExecutionMetrics(1), 'step failed');

    execution.retryWorkflow();

    expect(execution.state).toBe('Running');
    expect(execution.workflowRetryCount).toBe(1);
    expect(execution.stepExecutions[0]?.status).toBe('Pending');
  });

  it('rejects invalid state transitions', () => {
    const execution = createExecution();

    expect(() => execution.markSucceeded(createEmptyWorkflowExecutionMetrics(1))).toThrow(
      InvalidWorkflowTransitionError,
    );
  });

  it('records append-only history entries', () => {
    const history = WorkflowExecutionHistory.create();
    history.append({
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      type: 'state-transition',
      message: 'started',
    });

    expect(history.entries).toHaveLength(1);
  });
});
