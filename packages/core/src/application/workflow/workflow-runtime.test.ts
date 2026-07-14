import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { WorkflowRuntime } from './workflow-runtime.js';
import {
  InMemoryWorkflowStepExecutorRegistry,
  type WorkflowStepExecutor,
} from './workflow-step-executor.js';
import { createWorkflowPlanFromExecutionPlan } from './execution-plan-workflow-adapter.js';
import { ExecuteWorkflowCommandHandler } from './handlers/execute-workflow.handler.js';
import { createExecuteWorkflowCommand } from './commands/execute-workflow.command.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import {
  createWorkflowPlan,
  createWorkflowStepDefinition,
} from '../../domain/workflow/workflow-plan.js';
import { createWorkflowExecutionContext } from '../../domain/workflow/workflow-execution-context.js';
import { createWorkflowExecutionPolicy } from '../../domain/workflow/workflow-execution-policy.js';
import { createExecutionPlan } from '../../domain/order/execution-plan.js';
import { WorkflowExecution } from '../../domain/workflow/workflow-execution.js';
import { createWorkflowStepExecution } from '../../domain/workflow/workflow-step-execution.js';
import {
  WorkflowCancelledEventName,
  WorkflowCompletedEventName,
  WorkflowFailedEventName,
  WorkflowStartedEventName,
  WorkflowStepCompletedEventName,
  WorkflowStepFailedEventName,
  WorkflowStepStartedEventName,
} from '../../domain/workflow/events/workflow-events.js';
import type { DomainEvent } from '../../domain/events/domain-event.js';
import { InvalidWorkflowTransitionError } from '../../domain/workflow/errors/workflow-errors.js';

import { setTimeout } from 'node:timers/promises';

const createPlan = (steps: Array<{ id: string; name: string; type?: string }>) =>
  createWorkflowPlan({
    workflowId: 'workflow-1',
    runId: 'run-1',
    sourcePlanId: 'plan-1',
    steps: steps.map((step) =>
      createWorkflowStepDefinition({
        id: createIdentifier('WorkflowStep', step.id),
        name: step.name,
        stepType: step.type ?? 'test',
        payload: { step: step.name },
      }),
    ),
  });

const createRuntime = () => {
  const eventBus = new InMemoryEventBus();
  const registry = new InMemoryWorkflowStepExecutorRegistry();
  const runtime = new WorkflowRuntime({ eventBus, stepExecutorRegistry: registry });
  const published: DomainEvent[] = [];

  const eventNames = [
    WorkflowStartedEventName,
    WorkflowStepStartedEventName,
    WorkflowStepCompletedEventName,
    WorkflowStepFailedEventName,
    WorkflowCompletedEventName,
    WorkflowFailedEventName,
    WorkflowCancelledEventName,
  ];

  for (const eventName of eventNames) {
    eventBus.subscribe(eventName, {
      eventName,
      handle(event) {
        published.push(event);
      },
    });
  }

  return { runtime, registry, eventBus, published };
};

const createRequest = (
  plan: ReturnType<typeof createPlan>,
  policy?: ReturnType<typeof createWorkflowExecutionPolicy>,
) => ({
  executionId: createIdentifier('WorkflowExecution', 'exec-1'),
  plan,
  context: createWorkflowExecutionContext({
    executionId: 'exec-1',
    workflowId: plan.workflowId,
    runId: plan.runId,
    sourcePlanId: plan.sourcePlanId,
    metadata: { source: 'test' },
  }),
  policy,
});

describe('createWorkflowPlanFromExecutionPlan', () => {
  it('maps execution plan steps into workflow steps', () => {
    const plan = createExecutionPlan({
      orderId: 'order-1',
      runId: 'run-1',
      steps: [
        { type: 'reserve-inventory', orderItemId: 'item-1', productId: 'product-1' },
        {
          type: 'resolve-provider',
          orderItemId: 'item-1',
          providerId: 'provider-1',
          capability: 'CreateAccount',
        },
      ],
    });

    const workflowPlan = createWorkflowPlanFromExecutionPlan(plan);

    expect(workflowPlan.steps).toHaveLength(2);
    expect(workflowPlan.steps[0]?.stepType).toBe('reserve-inventory');
    expect(workflowPlan.steps[1]?.stepType).toBe('resolve-provider');
  });
});

describe('WorkflowRuntime', () => {
  it('executes all steps successfully', async () => {
    const { runtime, registry, published } = createRuntime();
    const calls: string[] = [];

    registry.register('test', async (_context, step) => {
      calls.push(step.name);
      return { output: { ok: true } };
    });

    const result = await runtime.execute(
      createRequest(
        createPlan([
          { id: 'step-1', name: 'first' },
          { id: 'step-2', name: 'second' },
        ]),
      ),
    );

    expect(result.status).toBe('Succeeded');
    expect(result.state).toBe('Succeeded');
    expect(calls).toEqual(['first', 'second']);
    expect(result.metrics.completedSteps).toBe(2);
    expect(result.metrics.failedSteps).toBe(0);
    expect(published.map((event) => event.eventName)).toEqual([
      WorkflowStartedEventName,
      WorkflowStepStartedEventName,
      WorkflowStepCompletedEventName,
      WorkflowStepStartedEventName,
      WorkflowStepCompletedEventName,
      WorkflowCompletedEventName,
    ]);
  });

  it('fails when a step fails after retries are exhausted', async () => {
    const { runtime, registry, published } = createRuntime();
    let attempts = 0;

    registry.register('test', async () => {
      attempts += 1;
      throw new Error('step exploded');
    });

    const result = await runtime.execute(
      createRequest(
        createPlan([{ id: 'step-1', name: 'failing' }]),
        createWorkflowExecutionPolicy({
          defaultRetryPolicy: { maxAttempts: 2, delayMs: 0 },
        }),
      ),
    );

    expect(result.status).toBe('Failed');
    expect(result.failureReason).toContain('step exploded');
    expect(attempts).toBe(2);
    expect(result.metrics.retriedAttempts).toBe(1);
    expect(published.at(-1)?.eventName).toBe(WorkflowFailedEventName);
  });

  it('retries a flaky step until it succeeds', async () => {
    const { runtime, registry } = createRuntime();
    let attempts = 0;

    registry.register('test', async () => {
      attempts += 1;

      if (attempts < 3) {
        throw new Error('temporary');
      }

      return { output: { recovered: true } };
    });

    const step = createWorkflowStepDefinition({
      id: createIdentifier('WorkflowStep', 'step-1'),
      name: 'flaky',
      stepType: 'test',
      payload: {},
      retryPolicy: { maxAttempts: 3, delayMs: 0 },
    });

    const result = await runtime.execute({
      ...createRequest(createPlan([{ id: 'step-1', name: 'flaky' }])),
      plan: createWorkflowPlan({
        workflowId: 'workflow-1',
        runId: 'run-1',
        sourcePlanId: 'plan-1',
        steps: [step],
      }),
    });

    expect(result.status).toBe('Succeeded');
    expect(attempts).toBe(3);
    expect(result.metrics.retriedAttempts).toBe(2);
  });

  it('cancels an in-flight workflow', async () => {
    const { runtime, registry, published } = createRuntime();

    registry.register('test', async () => {
      runtime.cancel('exec-1');
      await setTimeout(10);
      return { output: { ok: true } };
    });

    const result = await runtime.execute(
      createRequest(createPlan([{ id: 'step-1', name: 'slow' }])),
    );

    expect(result.status).toBe('Cancelled');
    expect(result.metrics.cancelled).toBe(true);
    expect(published.at(-1)?.eventName).toBe(WorkflowCancelledEventName);
  });

  it('fails a step when timeout policy is exceeded', async () => {
    const { runtime, registry } = createRuntime();

    registry.register('test', async () => {
      await setTimeout(50);
      return { output: { ok: true } };
    });

    const step = createWorkflowStepDefinition({
      id: createIdentifier('WorkflowStep', 'step-1'),
      name: 'slow',
      stepType: 'test',
      payload: {},
      timeoutMs: 5,
    });

    const result = await runtime.execute({
      ...createRequest(
        createPlan([{ id: 'step-1', name: 'slow' }]),
        createWorkflowExecutionPolicy({ defaultStepTimeoutMs: 5 }),
      ),
      plan: createWorkflowPlan({
        workflowId: 'workflow-1',
        runId: 'run-1',
        sourcePlanId: 'plan-1',
        steps: [step],
      }),
    });

    expect(result.status).toBe('Failed');
    expect(result.failureReason).toContain('timed out');
  });

  it('collects metrics independently from business logic', async () => {
    const { runtime, registry } = createRuntime();
    const businessSpy = vi.fn(async () => ({ output: { value: 42 } }));

    registry.register('test', businessSpy as WorkflowStepExecutor);

    const result = await runtime.execute(
      createRequest(createPlan([{ id: 'step-1', name: 'work' }])),
    );

    expect(businessSpy).toHaveBeenCalledOnce();
    expect(result.metrics.totalSteps).toBe(1);
    expect(result.metrics.completedSteps).toBe(1);
    expect(result.metrics.stepDurationsMs['step-1']).toBeGreaterThanOrEqual(0);
  });

  it('records execution history for state and step events', async () => {
    const { runtime, registry } = createRuntime();

    registry.register('test', async () => ({ output: {} }));

    const result = await runtime.execute(
      createRequest(createPlan([{ id: 'step-1', name: 'work' }])),
    );

    expect(result.history.entries.length).toBeGreaterThanOrEqual(3);
    expect(result.history.entries.some((entry) => entry.type === 'step-started')).toBe(true);
    expect(result.history.entries.some((entry) => entry.type === 'step-completed')).toBe(true);
  });

  it('does not execute a step twice unless retry policy allows it', async () => {
    const { runtime, registry } = createRuntime();
    let attempts = 0;

    registry.register('test', async () => {
      attempts += 1;
      return { output: {} };
    });

    await runtime.execute(createRequest(createPlan([{ id: 'step-1', name: 'once' }])));

    expect(attempts).toBe(1);
  });

  it('delegates through the CQRS command handler', async () => {
    const { runtime, registry } = createRuntime();
    registry.register('test', async () => ({ output: {} }));

    const handler = new ExecuteWorkflowCommandHandler(runtime);
    const result = await handler.execute(
      createExecuteWorkflowCommand(createRequest(createPlan([{ id: 'step-1', name: 'cqrs' }]))),
    );

    expect(result.status).toBe('Succeeded');
    expect(handler.commandName).toBe('workflow.execute');
  });
});

describe('WorkflowExecution transitions', () => {
  it('rejects invalid transitions outside runtime', () => {
    const execution = WorkflowExecution.create({
      id: createIdentifier('WorkflowExecution', 'exec-invalid'),
      workflowId: 'workflow-1',
      runId: 'run-1',
      sourcePlanId: 'plan-1',
      stepExecutions: [
        createWorkflowStepExecution({
          stepId: 'step-1',
          stepName: 'one',
          stepType: 'test',
        }),
      ],
    });

    expect(() => execution.transitionTo('Succeeded')).toThrow(InvalidWorkflowTransitionError);
  });
});
