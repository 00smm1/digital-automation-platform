import { describe, expect, it } from 'vitest';

import { PipelineRunner } from './pipeline-runner.js';
import {
  InMemoryPipelineStepExecutorRegistry,
  createDeterministicPipelineStepExecutor,
} from './in-memory-pipeline-step-executor-registry.js';
import { WorkflowDefinition } from '../../domain/workflow-pipeline/workflow-definition.js';
import { createPipelineStepDefinition } from '../../domain/workflow-pipeline/pipeline-step-definition.js';
import { createPipelineStepExecutionContext } from '../../domain/workflow-pipeline/pipeline-step-execution-context.js';
import { createPipelineStepExecutionResult } from '../../domain/workflow-pipeline/pipeline-step-execution-result.js';
import { createIdentifier } from '../../shared/types/identifier.js';

const createDefinition = (steps: ReturnType<typeof createPipelineStepDefinition>[]) =>
  WorkflowDefinition.create({
    id: createIdentifier('WorkflowDefinition', 'lord-tv-premium-delivery'),
    name: 'Lord TV Premium Delivery',
    steps,
  });

const createContext = (input: Record<string, unknown> = {}) =>
  createPipelineStepExecutionContext({
    executionId: 'exec-001',
    workflowDefinitionId: 'lord-tv-premium-delivery',
    runId: 'run-001',
    input: { orderId: 'order-1001', ...input },
    metadata: { correlationId: 'evt-001' },
  });

const createRunner = () => {
  const registry = new InMemoryPipelineStepExecutorRegistry();
  const runner = new PipelineRunner({ stepExecutorRegistry: registry });

  return { registry, runner };
};

describe('PipelineRunner', () => {
  it('executes a successful multi-step pipeline in order', async () => {
    const { registry, runner } = createRunner();
    const executionOrder: string[] = [];

    registry.register('inventory.reserve', async (_context, step) => {
      executionOrder.push(step.name);
      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
        output: { reserved: true },
      });
    });

    registry.register('provider.provision', async (_context, step) => {
      executionOrder.push(step.name);
      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
        output: { provisioned: true },
      });
    });

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Reserve Inventory',
        stepType: 'inventory.reserve',
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-2'),
        name: 'Provision Service',
        stepType: 'provider.provision',
        payload: {},
      }),
    ]);

    const result = await runner.run(definition, createContext());

    expect(result.status).toBe('succeeded');
    expect(result.completedSteps).toHaveLength(2);
    expect(result.failedStep).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(executionOrder).toEqual(['Reserve Inventory', 'Provision Service']);
  });

  it('stops on the first failed step and preserves completed steps', async () => {
    const { registry, runner } = createRunner();

    registry.register(
      'inventory.reserve',
      createDeterministicPipelineStepExecutor({ stepType: 'inventory.reserve' }),
    );

    registry.register('provider.provision', async (_context, step) => {
      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'failed',
        startedAt: timestamp,
        completedAt: timestamp,
        failureReason: 'provider unavailable',
      });
    });

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Reserve Inventory',
        stepType: 'inventory.reserve',
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-2'),
        name: 'Provision Service',
        stepType: 'provider.provision',
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-3'),
        name: 'Send Notification',
        stepType: 'notification.send',
        payload: {},
      }),
    ]);

    const result = await runner.run(definition, createContext());

    expect(result.status).toBe('failed');
    expect(result.completedSteps).toHaveLength(1);
    expect(result.completedSteps[0]?.stepName).toBe('Reserve Inventory');
    expect(result.failedStep?.stepName).toBe('Provision Service');
    expect(result.failureReason).toBe('provider unavailable');
  });

  it('returns empty status for a workflow with no steps', async () => {
    const { runner } = createRunner();

    const definition = WorkflowDefinition.create({
      id: createIdentifier('WorkflowDefinition', 'wf-empty'),
      name: 'Empty Workflow',
      steps: [],
    });

    const result = await runner.run(definition, createContext());

    expect(result.status).toBe('empty');
    expect(result.completedSteps).toHaveLength(0);
    expect(result.failedStep).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('executes a single-step workflow', async () => {
    const { registry, runner } = createRunner();

    registry.register(
      'inventory.reserve',
      createDeterministicPipelineStepExecutor({
        stepType: 'inventory.reserve',
        output: { itemId: 'inv-42' },
      }),
    );

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Reserve Inventory',
        stepType: 'inventory.reserve',
        payload: { sku: 'LTV-PREM-12M' },
      }),
    ]);

    const result = await runner.run(definition, createContext());

    expect(result.status).toBe('succeeded');
    expect(result.completedSteps).toHaveLength(1);
    expect(result.completedSteps[0]?.output).toEqual({ itemId: 'inv-42' });
  });

  it('does not mutate the execution context', async () => {
    const { registry, runner } = createRunner();

    registry.register('inventory.reserve', async (context, step) => {
      (context.input as { orderId: string }).orderId = 'mutated';
      (context.metadata as { correlationId: string }).correlationId = 'mutated';

      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
      });
    });

    const context = createContext();
    const snapshot = JSON.stringify(context);

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Reserve Inventory',
        stepType: 'inventory.reserve',
        payload: {},
      }),
    ]);

    await runner.run(definition, context);

    expect(JSON.stringify(context)).toBe(snapshot);
  });

  it('converts runtime exceptions into structured pipeline failure', async () => {
    const { registry, runner } = createRunner();

    registry.register(
      'inventory.reserve',
      createDeterministicPipelineStepExecutor({ stepType: 'inventory.reserve' }),
    );

    registry.register('provider.provision', async () => {
      throw new Error('runtime exploded');
    });

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Reserve Inventory',
        stepType: 'inventory.reserve',
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-2'),
        name: 'Provision Service',
        stepType: 'provider.provision',
        payload: {},
      }),
    ]);

    const result = await runner.run(definition, createContext());

    expect(result.status).toBe('failed');
    expect(result.failedStep?.failureReason).toBe('runtime exploded');
    expect(result.completedSteps).toHaveLength(1);
  });

  it('executes deterministically with configured in-memory executors', async () => {
    const { registry, runner } = createRunner();
    const recordedStepTypes: string[] = [];

    registry.register('step.a', async (_context, step) => {
      recordedStepTypes.push(step.stepType);
      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
      });
    });

    registry.register('step.b', async (_context, step) => {
      recordedStepTypes.push(step.stepType);
      const timestamp = new Date();

      return createPipelineStepExecutionResult({
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
      });
    });

    const definition = createDefinition([
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-1'),
        name: 'Step A',
        stepType: 'step.a',
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'step-2'),
        name: 'Step B',
        stepType: 'step.b',
        payload: {},
      }),
    ]);

    const first = await runner.run(definition, createContext());
    const second = await runner.run(definition, createContext());

    expect(first.completedSteps.map((step) => step.stepType)).toEqual(['step.a', 'step.b']);
    expect(second.completedSteps.map((step) => step.stepType)).toEqual(['step.a', 'step.b']);
    expect(recordedStepTypes).toEqual(['step.a', 'step.b', 'step.a', 'step.b']);
  });
});

describe('InMemoryPipelineStepExecutorRegistry', () => {
  it('isolates registry state between instances', async () => {
    const first = new InMemoryPipelineStepExecutorRegistry();
    const second = new InMemoryPipelineStepExecutorRegistry();

    first.register(
      'inventory.reserve',
      createDeterministicPipelineStepExecutor({ stepType: 'inventory.reserve' }),
    );

    const step = createPipelineStepDefinition({
      id: createIdentifier('PipelineStep', 'step-1'),
      name: 'Reserve Inventory',
      stepType: 'inventory.reserve',
      payload: {},
    });

    await expect(second.execute(createContext(), step)).rejects.toThrow(
      'No pipeline step executor registered',
    );
  });
});
