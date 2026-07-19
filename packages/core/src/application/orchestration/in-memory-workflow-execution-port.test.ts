import { describe, expect, it } from 'vitest';

import { InMemoryWorkflowExecutionPort } from './in-memory-workflow-execution-port.js';
import { createWorkflowExecutionRequest } from '../../domain/orchestration/workflow-execution-request.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { createWorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';

const createSampleRequest = (id: string) =>
  createWorkflowExecutionRequest({
    executionId: createIdentifier('WorkflowExecution', id),
    eventId: 'evt-1',
    automationId: 'auto-1',
    workflowId: 'workflow-1',
    eventType: 'order.paid',
    occurredAt: new Date('2026-07-19T00:00:00.000Z'),
    correlationId: 'evt-1',
    payload: { product: { type: 'lord-tv-premium' } },
  });

describe('InMemoryWorkflowExecutionPort', () => {
  it('records requests in order', async () => {
    const port = new InMemoryWorkflowExecutionPort();
    const first = createSampleRequest('exec-1');
    const second = createSampleRequest('exec-2');

    await port.execute(first);
    await port.execute(second);

    const recorded = port.getRecordedRequests();

    expect(recorded).toHaveLength(2);
    expect(recorded[0]?.executionId).toBe(first.executionId);
    expect(recorded[1]?.executionId).toBe(second.executionId);
  });

  it('returns configured outcomes', async () => {
    const port = new InMemoryWorkflowExecutionPort();

    port.configureHandler((request) =>
      createWorkflowExecutionOutcome({
        executionId: request.executionId,
        automationId: request.automationId,
        workflowId: request.workflowId,
        status: 'failed',
        failureReason: 'configured failure',
      }),
    );

    const outcome = await port.execute(createSampleRequest('exec-1'));

    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('configured failure');
  });

  it('throws configured exceptions', async () => {
    const port = new InMemoryWorkflowExecutionPort();
    port.configureError(new Error('runtime exploded'));

    await expect(port.execute(createSampleRequest('exec-1'))).rejects.toThrow('runtime exploded');
    expect(port.getRecordedRequests()).toHaveLength(1);
  });

  it('isolates state between instances', async () => {
    const first = new InMemoryWorkflowExecutionPort();
    const second = new InMemoryWorkflowExecutionPort();

    await first.execute(createSampleRequest('exec-1'));

    expect(first.getRecordedRequests()).toHaveLength(1);
    expect(second.getRecordedRequests()).toHaveLength(0);
  });

  it('does not allow mutating internal state through returned history', async () => {
    const port = new InMemoryWorkflowExecutionPort();
    await port.execute(createSampleRequest('exec-1'));

    const recorded = port.getRecordedRequests();
    (recorded[0] as { workflowId: string }).workflowId = 'mutated';

    expect(port.getRecordedRequests()[0]?.workflowId).toBe('workflow-1');
  });
});
