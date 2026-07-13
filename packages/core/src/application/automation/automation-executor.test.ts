import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { AutomationExecutor } from './automation-executor.js';
import { ExecuteAutomationCommandHandler } from './handlers/execute-automation.handler.js';
import { createExecuteAutomationCommand } from './commands/execute-automation.command.js';
import type { AutomationContext } from '../../domain/automation/automation-context.js';
import type { AutomationStep, StepResult } from '../../domain/automation/automation-step.js';
import { AutomationPipeline } from '../../domain/automation/automation-pipeline.js';
import {
  AutomationFailedEventName,
  AutomationSucceededEventName,
} from '../../domain/automation/events/automation-events.js';
import { createRetryPolicy } from '../../domain/automation/retry-policy.js';
import type { DomainEvent } from '../../domain/events/domain-event.js';

const createContext = (overrides: Partial<AutomationContext> = {}): AutomationContext => ({
  automationId: 'automation-1',
  runId: 'run-1',
  order: { id: 'order-1', reference: 'ORD-001' },
  customer: { id: 'customer-1', email: 'customer@example.com' },
  metadata: { source: 'test' },
  ...overrides,
});

const createSuccessStep = (
  stepName: string,
  onExecute: (context: AutomationContext) => void = () => undefined,
  options: { retryable?: boolean } = {},
): AutomationStep => ({
  stepName,
  retryable: options.retryable,
  async execute(context) {
    onExecute(context);
    const timestamp = new Date();

    return {
      stepName,
      status: 'success',
      startedAt: timestamp,
      completedAt: timestamp,
      attempts: 1,
    } satisfies StepResult;
  },
});

const createFailingStep = (
  stepName: string,
  error = 'step failed',
  options: { retryable?: boolean } = {},
): AutomationStep => ({
  stepName,
  retryable: options.retryable,
  async execute() {
    const timestamp = new Date();

    return {
      stepName,
      status: 'failed',
      startedAt: timestamp,
      completedAt: timestamp,
      attempts: 1,
      error,
    } satisfies StepResult;
  },
});

const createFlakyStep = (stepName: string, failUntilAttempt: number): AutomationStep => {
  let attempts = 0;

  return {
    stepName,
    retryable: true,
    async execute() {
      attempts += 1;
      const timestamp = new Date();

      if (attempts < failUntilAttempt) {
        return {
          stepName,
          status: 'failed',
          startedAt: timestamp,
          completedAt: timestamp,
          attempts,
          error: 'temporary failure',
        } satisfies StepResult;
      }

      return {
        stepName,
        status: 'success',
        startedAt: timestamp,
        completedAt: timestamp,
        attempts,
      } satisfies StepResult;
    },
  };
};

const collectPublishedEvents = (eventBus: InMemoryEventBus): DomainEvent[] => {
  const published: DomainEvent[] = [];

  eventBus.subscribe(AutomationSucceededEventName, {
    eventName: AutomationSucceededEventName,
    handle(event) {
      published.push(event);
    },
  });

  eventBus.subscribe(AutomationFailedEventName, {
    eventName: AutomationFailedEventName,
    handle(event) {
      published.push(event);
    },
  });

  return published;
};

describe('AutomationExecutor', () => {
  it('executes all pipeline steps in order', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const executionOrder: string[] = [];
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [
        createSuccessStep('step-1', () => executionOrder.push('step-1')),
        createSuccessStep('step-2', () => executionOrder.push('step-2')),
        createSuccessStep('step-3', () => executionOrder.push('step-3')),
      ],
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.status).toBe('success');
    expect(executionOrder).toEqual(['step-1', 'step-2', 'step-3']);
    expect(result.log.steps).toHaveLength(3);
    expect(result.log.steps.every((step) => step.status === 'success')).toBe(true);
  });

  it('publishes a success event after successful execution', async () => {
    const eventBus = new InMemoryEventBus();
    const published = collectPublishedEvents(eventBus);
    const executor = new AutomationExecutor({ eventBus });
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createSuccessStep('step-1')],
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.status).toBe('success');
    expect(published).toHaveLength(1);
    expect(published[0]?.eventName).toBe(AutomationSucceededEventName);
  });

  it('publishes a failure event when a step fails', async () => {
    const eventBus = new InMemoryEventBus();
    const published = collectPublishedEvents(eventBus);
    const executor = new AutomationExecutor({ eventBus });
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [
        createSuccessStep('step-1'),
        createFailingStep('step-2'),
        createSuccessStep('step-3'),
      ],
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.status).toBe('failed');
    expect(result.log.steps).toHaveLength(2);
    expect(published).toHaveLength(1);
    expect(published[0]?.eventName).toBe(AutomationFailedEventName);
  });

  it('does not run later steps after a terminal failure', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const thirdStep = createSuccessStep('step-3');
    const thirdStepSpy = vi.spyOn(thirdStep, 'execute');
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createSuccessStep('step-1'), createFailingStep('step-2'), thirdStep],
    });

    await executor.execute(pipeline, createContext());

    expect(thirdStepSpy).not.toHaveBeenCalled();
  });

  it('retries only retryable steps according to the retry policy', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createFlakyStep('step-1', 2)],
      retryPolicy: createRetryPolicy({ maxAttempts: 2, delayMs: 0 }),
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.status).toBe('success');
    expect(result.log.steps[0]?.attempts).toBe(2);
  });

  it('does not retry a non-retryable failed step even when the pipeline allows retries', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    let executionCount = 0;
    const failingStep: AutomationStep = {
      stepName: 'step-1',
      async execute() {
        executionCount += 1;
        const timestamp = new Date();

        return {
          stepName: 'step-1',
          status: 'failed',
          startedAt: timestamp,
          completedAt: timestamp,
          attempts: executionCount,
          error: 'step failed',
        } satisfies StepResult;
      },
    };
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [failingStep],
      retryPolicy: createRetryPolicy({ maxAttempts: 3, delayMs: 0 }),
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.status).toBe('failed');
    expect(executionCount).toBe(1);
    expect(result.log.steps[0]?.attempts).toBe(1);
  });

  it('fails validation before executing steps', async () => {
    const eventBus = new InMemoryEventBus();
    const published = collectPublishedEvents(eventBus);
    const step = createSuccessStep('step-1');
    const executeSpy = vi.spyOn(step, 'execute');
    const executor = new AutomationExecutor({ eventBus });
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [step],
    });

    const result = await executor.execute(pipeline, createContext({ runId: '   ' }));

    expect(result.status).toBe('failed');
    expect(executeSpy).not.toHaveBeenCalled();
    expect(published[0]?.eventName).toBe(AutomationFailedEventName);
  });

  it('records an execution log with step results', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createSuccessStep('step-1'), createSuccessStep('step-2')],
    });

    const result = await executor.execute(pipeline, createContext());

    expect(result.log.runId).toBe('run-1');
    expect(result.log.automationId).toBe('automation-1');
    expect(result.log.pipelineId).toBe('pipeline-1');
    expect(result.log.status).toBe('success');
    expect(result.log.completedAt).toBeInstanceOf(Date);
    expect(result.log.steps.map((step) => step.stepName)).toEqual(['step-1', 'step-2']);
  });

  it('executes an inventory-style automation without provider context', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const inventoryStep = createSuccessStep('allocate-inventory', (context) => {
      expect(context.provider).toBeUndefined();
    });
    const pipeline = new AutomationPipeline({
      id: 'inventory-pipeline',
      steps: [inventoryStep],
    });

    const result = await executor.execute(
      pipeline,
      createContext({
        payment: undefined,
        provider: undefined,
        metadata: { deliveryModel: 'inventory' },
      }),
    );

    expect(result.status).toBe('success');
  });

  it('executes an automation without payment context', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const step = createSuccessStep('prepare-fulfillment', (context) => {
      expect(context.payment).toBeUndefined();
    });
    const pipeline = new AutomationPipeline({
      id: 'fulfillment-pipeline',
      steps: [step],
    });

    const result = await executor.execute(
      pipeline,
      createContext({
        payment: undefined,
        provider: { id: 'provider-1', type: 'generic' },
      }),
    );

    expect(result.status).toBe('success');
  });
});

describe('ExecuteAutomationCommandHandler', () => {
  it('delegates command execution to AutomationExecutor', async () => {
    const eventBus = new InMemoryEventBus();
    const executor = new AutomationExecutor({ eventBus });
    const handler = new ExecuteAutomationCommandHandler(executor);
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createSuccessStep('step-1')],
    });
    const context = createContext();

    const result = await handler.execute(createExecuteAutomationCommand(pipeline, context));

    expect(result.status).toBe('success');
    expect(handler.commandName).toBe('automation.execute');
  });
});
