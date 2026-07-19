import { describe, expect, it } from 'vitest';

import { PlatformEventOrchestrator } from './platform-event-orchestrator.js';
import { InMemoryWorkflowExecutionPort } from './in-memory-workflow-execution-port.js';
import { AutomationMatcher } from '../automation-definition/automation-matcher.js';
import { InMemoryAutomationDefinitionRepository } from '../../domain/automation-definition/in-memory-automation-definition-repository.js';
import { AutomationDefinition } from '../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../domain/automation-definition/condition-group.js';
import { createNormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import type { WorkflowExecutionRequestId } from '../../domain/orchestration/workflow-execution-request.js';
import { createWorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';

const createDefinition = (params: {
  id: string;
  eventType: string;
  workflowReference: string;
  priority: number;
  enabled?: boolean;
  conditions?: ConditionGroup;
}) =>
  AutomationDefinition.create({
    id: createIdentifier('AutomationDefinition', params.id),
    name: params.id,
    trigger: AutomationTrigger.create(params.eventType),
    workflowReference: params.workflowReference,
    priority: params.priority,
    status: params.enabled === false ? 'disabled' : 'enabled',
    conditions: params.conditions,
  });

const createOrchestrator = (options?: { executionIds?: WorkflowExecutionRequestId[] }) => {
  const repository = new InMemoryAutomationDefinitionRepository();
  const matcher = new AutomationMatcher({ repository });
  const workflowPort = new InMemoryWorkflowExecutionPort();
  let sequence = 0;
  const executionIds = options?.executionIds ?? [];

  const orchestrator = new PlatformEventOrchestrator({
    matcher,
    workflowExecutionPort: workflowPort,
    executionIdGenerator: () => {
      const id = executionIds[sequence] ?? (`exec-${sequence}` as WorkflowExecutionRequestId);
      sequence += 1;
      return id;
    },
  });

  return { repository, matcher, workflowPort, orchestrator };
};

const createOrderPaidEvent = (payload: Record<string, unknown> = {}) =>
  createNormalizedPlatformEvent({
    eventId: 'evt-order-paid-001',
    eventType: 'order.paid',
    occurredAt: new Date('2026-07-19T10:00:00.000Z'),
    payload: {
      order: { id: 'order-1001', status: 'paid' },
      customer: { id: 'customer-42' },
      ...payload,
    },
  });

describe('PlatformEventOrchestrator', () => {
  it('returns noMatch when no automations match', async () => {
    const { orchestrator, workflowPort } = createOrchestrator();

    const result = await orchestrator.process(
      createNormalizedPlatformEvent({
        eventId: 'evt-1',
        eventType: 'order.refunded',
        occurredAt: new Date(),
        payload: {},
      }),
    );

    expect(result.overallStatus).toBe('noMatch');
    expect(result.matchedAutomationCount).toBe(0);
    expect(result.attemptedExecutionCount).toBe(0);
    expect(workflowPort.getRecordedRequests()).toHaveLength(0);
  });

  it('executes a single matched automation', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator({
      executionIds: [createIdentifier('WorkflowExecution', 'exec-0')],
    });

    await repository.save(
      createDefinition({
        id: 'lord-tv-premium',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-premium-delivery',
        priority: 10,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'lord-tv-premium',
            }),
          ],
        }),
      }),
    );

    const event = createOrderPaidEvent({ product: { type: 'lord-tv-premium' } });
    const result = await orchestrator.process(event);

    expect(result.overallStatus).toBe('succeeded');
    expect(result.matchedAutomationCount).toBe(1);
    expect(result.successfulExecutionCount).toBe(1);

    const requests = workflowPort.getRecordedRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.automationId).toBe(
      createIdentifier('AutomationDefinition', 'lord-tv-premium'),
    );
    expect(requests[0]?.workflowId).toBe('lord-tv-premium-delivery');
    expect(requests[0]?.eventId).toBe('evt-order-paid-001');
    expect(requests[0]?.eventType).toBe('order.paid');
    expect(requests[0]?.correlationId).toBe('evt-order-paid-001');
  });

  it('executes multiple matches in matcher order with priority respected', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator({
      executionIds: [
        createIdentifier('WorkflowExecution', 'exec-0'),
        createIdentifier('WorkflowExecution', 'exec-1'),
        createIdentifier('WorkflowExecution', 'exec-2'),
      ],
    });

    await repository.save(
      createDefinition({
        id: 'z-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-z',
        priority: 10,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'a-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-a',
        priority: 100,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'm-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-m',
        priority: 100,
      }),
    );

    const result = await orchestrator.process(createOrderPaidEvent());

    expect(result.matchedAutomationCount).toBe(3);
    expect(result.overallStatus).toBe('succeeded');
    expect(workflowPort.getRecordedRequests().map((request) => request.automationId)).toEqual([
      createIdentifier('AutomationDefinition', 'a-auto'),
      createIdentifier('AutomationDefinition', 'm-auto'),
      createIdentifier('AutomationDefinition', 'z-auto'),
    ]);
  });

  it('does not execute disabled automations or failed conditions', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator();

    await repository.save(
      createDefinition({
        id: 'disabled-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-disabled',
        priority: 100,
        enabled: false,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'failed-condition',
        eventType: 'order.paid',
        workflowReference: 'workflow-fail',
        priority: 90,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'other',
            }),
          ],
        }),
      }),
    );

    const result = await orchestrator.process(
      createOrderPaidEvent({ product: { type: 'lord-tv-premium' } }),
    );

    expect(result.overallStatus).toBe('noMatch');
    expect(workflowPort.getRecordedRequests()).toHaveLength(0);
  });

  it('returns partiallySucceeded when mixed outcomes occur and continues execution', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator();

    await repository.save(
      createDefinition({
        id: 'first-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-first',
        priority: 100,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'second-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-second',
        priority: 90,
      }),
    );

    workflowPort.configureHandler((request) =>
      createWorkflowExecutionOutcome({
        executionId: request.executionId,
        automationId: request.automationId,
        workflowId: request.workflowId,
        status: request.automationId.endsWith('first-auto') ? 'succeeded' : 'failed',
        failureReason: request.automationId.endsWith('first-auto') ? undefined : 'step failed',
      }),
    );

    const result = await orchestrator.process(createOrderPaidEvent());

    expect(result.overallStatus).toBe('partiallySucceeded');
    expect(result.successfulExecutionCount).toBe(1);
    expect(result.failedExecutionCount).toBe(1);
    expect(result.executionOutcomes).toHaveLength(2);
    expect(result.executionOutcomes[0]?.status).toBe('succeeded');
    expect(result.executionOutcomes[1]?.status).toBe('failed');
    expect(workflowPort.getRecordedRequests()).toHaveLength(2);
  });

  it('returns failed when all executions fail', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator();

    await repository.save(
      createDefinition({
        id: 'auto-1',
        eventType: 'order.paid',
        workflowReference: 'workflow-1',
        priority: 1,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'auto-2',
        eventType: 'order.paid',
        workflowReference: 'workflow-2',
        priority: 2,
      }),
    );

    workflowPort.configureHandler((request) =>
      createWorkflowExecutionOutcome({
        executionId: request.executionId,
        automationId: request.automationId,
        workflowId: request.workflowId,
        status: 'failed',
        failureReason: 'failed',
      }),
    );

    const result = await orchestrator.process(createOrderPaidEvent());

    expect(result.overallStatus).toBe('failed');
    expect(result.successfulExecutionCount).toBe(0);
    expect(result.failedExecutionCount).toBe(2);
  });

  it('converts runtime exceptions into structured failures and continues', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator();

    await repository.save(
      createDefinition({
        id: 'first-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-first',
        priority: 100,
      }),
    );
    await repository.save(
      createDefinition({
        id: 'second-auto',
        eventType: 'order.paid',
        workflowReference: 'workflow-second',
        priority: 90,
      }),
    );

    let callCount = 0;
    workflowPort.configureHandler(async () => {
      callCount += 1;

      if (callCount === 1) {
        throw new Error('runtime exploded');
      }

      return createWorkflowExecutionOutcome({
        executionId: createIdentifier('WorkflowExecution', `exec-${callCount}`),
        automationId: 'second-auto',
        workflowId: 'workflow-second',
        status: 'succeeded',
      });
    });

    const result = await orchestrator.process(createOrderPaidEvent());

    expect(result.overallStatus).toBe('partiallySucceeded');
    expect(result.executionOutcomes[0]?.status).toBe('failed');
    expect(result.executionOutcomes[0]?.failureReason).toBe('runtime exploded');
    expect(result.executionOutcomes[1]?.status).toBe('succeeded');
    expect(result.executionOutcomes[0]?.failureReason).not.toContain('lord-tv-premium');
  });

  it('does not mutate the incoming event or payload', async () => {
    const { repository, orchestrator } = createOrchestrator();

    await repository.save(
      createDefinition({
        id: 'auto-1',
        eventType: 'order.paid',
        workflowReference: 'workflow-1',
        priority: 1,
      }),
    );

    const event = createOrderPaidEvent({ product: { type: 'lord-tv-premium' } });
    const snapshot = JSON.stringify(event);

    await orchestrator.process(event);

    expect(JSON.stringify(event)).toBe(snapshot);
  });
});

describe('PlatformEventOrchestrator end-to-end', () => {
  it('processes synthetic order.paid through repository, matcher, orchestrator, and workflow port', async () => {
    const { repository, orchestrator, workflowPort } = createOrchestrator({
      executionIds: [createIdentifier('WorkflowExecution', 'exec-premium')],
    });

    await repository.save(
      createDefinition({
        id: 'lord-tv-basic',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-basic-delivery',
        priority: 10,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'lord-tv-basic',
            }),
          ],
        }),
      }),
    );

    await repository.save(
      createDefinition({
        id: 'lord-tv-premium',
        eventType: 'order.paid',
        workflowReference: 'lord-tv-premium-delivery',
        priority: 20,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.type',
              operator: 'equals',
              expectedValue: 'lord-tv-premium',
            }),
          ],
        }),
      }),
    );

    const result = await orchestrator.process(
      createOrderPaidEvent({ product: { type: 'lord-tv-premium', sku: 'LTV-PREM-12M' } }),
    );

    expect(result.overallStatus).toBe('succeeded');
    expect(result.matchedAutomationCount).toBe(1);
    expect(result.executionOutcomes[0]?.workflowId).toBe('lord-tv-premium-delivery');
    expect(workflowPort.getRecordedRequests()[0]?.executionId).toBe(
      createIdentifier('WorkflowExecution', 'exec-premium'),
    );
  });
});
