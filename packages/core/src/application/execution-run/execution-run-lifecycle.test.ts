import { describe, expect, it } from 'vitest';

import { createInboundGatewayStack } from '../inbound-event/composition/create-inbound-gateway-stack.js';
import {
  createValidExternalOrderPaidEnvelope,
  FakeInboundEventAdapter,
} from '../inbound-event/fake-inbound-event-adapter.js';
import { createExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import { createIdempotencyKey } from '../../domain/inbound-event/idempotency-key.js';
import { createExecutionRunId } from '../../domain/execution-run/execution-run-id.js';
import { ExecutionRunCoordinator } from './execution-run-coordinator.js';
import { InMemoryExecutionRunRepository } from '../../domain/execution-run/in-memory-execution-run-repository.js';
import { ExecutionRunRepositoryError } from '../../domain/execution-run/errors/execution-run-errors.js';
import { FakeClock } from '../../shared/time/clock.js';
import { createExecutionRun } from '../../domain/execution-run/execution-run.js';
import { DigitalProductProvisioningError } from '../../domain/provisioning/errors/provisioning-errors.js';
import { CustomerNotificationError } from '../../domain/notification/errors/notification-errors.js';
import { InboundEventNormalizationError } from '../../domain/inbound-event/errors/inbound-event-errors.js';
import { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';

const processEnvelope = async (
  stack: Awaited<ReturnType<typeof createInboundGatewayStack>>,
  overrides: Parameters<typeof createValidExternalOrderPaidEnvelope>[0] = {},
) => {
  const envelope = createValidExternalOrderPaidEnvelope(overrides);
  return stack.inboundGateway.process(envelope, stack.inboundAdapter);
};

describe('Execution run lifecycle end-to-end', () => {
  it('creates exactly one execution run for a successful inbound event', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');
    expect(result.executionRunId).toBeDefined();
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);
  });

  it('records received, processing, and completed lifecycle states', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);
    const run = await stack.executionRunRepository.findById(result.executionRunId!);

    expect(run?.status).toBe('completed');
    expect(run?.startedAt).toBeDefined();
    expect(run?.completedAt).toBeDefined();
    expect(result.executionRunStatus).toBe('completed');
  });

  it('does not create a second execution run for duplicate inbound events', async () => {
    const stack = await createInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const duplicate = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(duplicate.status).toBe('duplicate');
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);
  });

  it('does not create an execution run when normalization fails', async () => {
    const stack = await createInboundGatewayStack();
    stack.inboundAdapter.configureError(
      new InboundEventNormalizationError('Configured normalization failure.', 'CONFIGURED_FAILURE'),
    );

    await processEnvelope(stack);

    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(0);
  });

  it('marks the execution run rejected for business validation failures', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack, {
      payload: {
        orderId: 'order-1001',
        customerId: 'customer-42',
        customerEmail: 'customer@example.com',
        productReference: 'digital-premium-12m',
        quantity: 0,
      },
    });

    expect(result.status).toBe('rejected');
    expect(result.executionRunStatus).toBe('rejected');

    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    expect(audit?.status).toBe('rejected');
    expect(audit?.failureCode).toBe('VALIDATION_FAILED');
  });

  it('marks the execution run failed when inventory reservation fails', async () => {
    const stack = await createInboundGatewayStack({ inventoryQuantity: 0 });
    const result = await processEnvelope(stack);

    expect(result.executionRunStatus).toBe('failed');
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    expect(audit?.status).toBe('failed');
  });

  it('preserves earlier successful progress when provisioning fails', async () => {
    const stack = await createInboundGatewayStack();
    stack.provisioningAdapter.configureError(
      new DigitalProductProvisioningError(
        'Provisioning provider unavailable.',
        'PROVISIONING_FAILED',
      ),
    );

    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(audit?.status).toBe('failed');
    expect(audit?.stepSummaries.map((step) => step.stepName)).toEqual([
      'Validate Order',
      'Reserve Inventory',
      'Provision Digital Product',
      'Notify Customer',
    ]);
    expect(audit?.stepSummaries[0]?.status).toBe('completed');
    expect(audit?.stepSummaries[1]?.status).toBe('completed');
    expect(audit?.stepSummaries[2]?.status).toBe('failed');
    expect(audit?.stepSummaries[3]?.status).toBe('skipped');
  });

  it('records provisioning success and notification failure separately', async () => {
    const stack = await createInboundGatewayStack();
    stack.notificationAdapter.configureError(
      new CustomerNotificationError('Notification delivery failed.', 'NOTIFICATION_FAILED'),
    );

    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(audit?.stepSummaries[2]?.status).toBe('completed');
    expect(audit?.stepSummaries[3]?.status).toBe('failed');
  });

  it('marks the run failed for unexpected provisioning exceptions with safe messaging', async () => {
    const stack = await createInboundGatewayStack();
    stack.provisioningAdapter.configureException(new Error('runtime exploded'));

    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(result.executionRunStatus).toBe('failed');
    expect(JSON.stringify(audit)).not.toContain('runtime exploded');
  });

  it('records matched automation and workflow references', async () => {
    const stack = await createInboundGatewayStack({ automationId: 'digital-premium-fulfillment' });
    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(audit?.matchedAutomations).toEqual(['digital-premium-fulfillment']);
    expect(audit?.workflows).toEqual(['digital-product-fulfillment']);
  });

  it('records pipeline step order correctly', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(audit?.stepSummaries.map((step) => step.stepName)).toEqual([
      'Validate Order',
      'Reserve Inventory',
      'Provision Digital Product',
      'Notify Customer',
    ]);
    expect(audit?.stepSummaries.map((step) => step.executionOrder)).toEqual([1, 2, 3, 4]);
  });

  it('marks later steps skipped after a fatal earlier pipeline failure', async () => {
    const stack = await createInboundGatewayStack({ inventoryQuantity: 0 });
    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);

    expect(audit?.stepSummaries[0]?.status).toBe('completed');
    expect(audit?.stepSummaries[1]?.status).toBe('failed');
    expect(audit?.stepSummaries[2]?.status).toBe('skipped');
    expect(audit?.stepSummaries[3]?.status).toBe('skipped');
  });

  it('returns typed failure for invalid lifecycle transitions', async () => {
    const repository = new InMemoryExecutionRunRepository();
    const clock = new FakeClock();
    const coordinator = new ExecutionRunCoordinator({ repository, clock });
    const idempotencyKey = createIdempotencyKey({
      sourceId: 'store',
      externalEventId: 'evt-1',
    });

    await coordinator.createRun({
      envelope: createValidExternalOrderPaidEnvelope(),
      normalizedEvent: {
        eventId: 'store:evt-1',
        eventType: 'order.paid',
        occurredAt: clock.now(),
        payload: { order: { id: 'order-1' } },
      },
      idempotencyKey,
    });

    const invalidTransition = await coordinator.finalizeFromOrchestration({
      executionRunId: createExecutionRunId({ idempotencyKey }),
      orchestrationResult: {
        eventId: 'store:evt-1',
        eventType: 'order.paid',
        matchedAutomationCount: 0,
        attemptedExecutionCount: 0,
        successfulExecutionCount: 0,
        failedExecutionCount: 0,
        executionOutcomes: [],
        overallStatus: 'noMatch',
      },
    });

    expect(invalidTransition.ok).toBe(false);
    if (!invalidTransition.ok) {
      expect(invalidTransition.error.failureCode).toBe('INVALID_TRANSITION');
    }
  });

  it('prevents terminal runs from returning to processing', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);
    const restart = await stack.executionRunCoordinator.startProcessing(result.executionRunId!);

    expect(restart.ok).toBe(false);
    if (!restart.ok) {
      expect(restart.error.failureCode).toBe('TERMINAL_RUN');
    }
  });

  it('rejects duplicate run creation deterministically', async () => {
    const repository = new InMemoryExecutionRunRepository();
    const coordinator = new ExecutionRunCoordinator({ repository, clock: new FakeClock() });
    const envelope = createValidExternalOrderPaidEnvelope();
    const idempotencyKey = createIdempotencyKey({
      sourceId: envelope.sourceId,
      externalEventId: envelope.externalEventId,
    });
    const params = {
      envelope,
      normalizedEvent: {
        eventId: `${envelope.sourceId}:${envelope.externalEventId}`,
        eventType: envelope.eventType,
        occurredAt: envelope.receivedAt,
        payload: { order: { id: 'order-1001' } },
      },
      idempotencyKey,
    };

    const first = await coordinator.createRun(params);
    const second = await coordinator.createRun(params);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('returns immutable repository copies that cannot mutate stored runs', async () => {
    const repository = new InMemoryExecutionRunRepository();
    const run = createExecutionRun({
      id: createExecutionRunId({
        idempotencyKey: createIdempotencyKey({ sourceId: 'store', externalEventId: 'evt-1' }),
      }),
      sourceId: 'store',
      externalEventId: 'evt-1',
      normalizedEventId: 'store:evt-1',
      idempotencyKey: createIdempotencyKey({ sourceId: 'store', externalEventId: 'evt-1' }),
      status: 'received',
      createdAt: new Date('2026-07-20T08:00:00.000Z'),
      matchedAutomationIds: ['automation-a'],
      workflowIds: ['workflow-a'],
      stepProgress: [],
    });

    await repository.create(run);
    const loaded = await repository.findById(run.id);
    (loaded as { matchedAutomationIds: string[] }).matchedAutomationIds.push('mutated');
    const reloaded = await repository.findById(run.id);

    expect(reloaded?.matchedAutomationIds).toEqual(['automation-a']);
  });

  it('excludes sensitive provisioning secrets from audit outputs', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);
    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    const run = await stack.executionRunRepository.findById(result.executionRunId!);
    const serialized = JSON.stringify({ audit, run });

    expect(serialized).not.toContain('secret-order-1001');
    expect(
      run?.stepProgress.find((step) => step.stepName === 'Provision Digital Product')
        ?.safeOutcomeMetadata,
    ).toEqual(
      expect.objectContaining({
        delivery: expect.objectContaining({ secret: '[REDACTED]' }),
      }),
    );
  });

  it('excludes raw inbound payload values from execution records', async () => {
    const stack = await createInboundGatewayStack();
    const secret = 'raw-payload-secret-value';
    const result = await stack.inboundGateway.process(
      createExternalEventEnvelope({
        sourceId: 'test-store',
        externalEventId: 'evt-secret',
        eventType: 'order.paid',
        receivedAt: new Date('2026-07-20T08:00:00.000Z'),
        payload: {
          orderId: 'order-1001',
          customerId: 'customer-42',
          customerEmail: 'customer@example.com',
          productReference: 'digital-premium-12m',
          quantity: 1,
          embeddedSecret: secret,
        },
        headers: { authorization: secret },
        metadata: { apiKey: secret },
      }),
      stack.inboundAdapter,
    );

    const audit = await stack.executionRunCoordinator.getAuditRecord(result.executionRunId!);
    const serialized = JSON.stringify(audit);

    expect(serialized).not.toContain(secret);
  });

  it('terminates processing when repository writes fail during lifecycle recording', async () => {
    const stack = await createInboundGatewayStack();
    stack.executionRunRepository.configureSaveFailure(
      new ExecutionRunRepositoryError('Configured repository save failure.', 'SAVE_FAILED'),
    );

    const result = await processEnvelope(stack);

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('SAVE_FAILED');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('uses inbound gateway, idempotency, orchestrator, pipeline, and lifecycle together', async () => {
    const stack = await createInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');
    expect(result.orchestrationResult?.executionOutcomes[0]?.pipelineExecutionResult).toBeDefined();
    expect(stack.orchestrator).toBeInstanceOf(PlatformEventOrchestrator);
    expect(stack.executionRunRepository.getAllRuns()).toHaveLength(1);
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(1);
  });
});

describe('FakeInboundEventAdapter with execution runs', () => {
  it('still maps valid envelopes to deterministic normalized event identifiers', async () => {
    const adapter = new FakeInboundEventAdapter();
    const envelope = createValidExternalOrderPaidEnvelope({
      sourceId: 'woo-store',
      externalEventId: 'wc-order-99',
    });

    const result = await adapter.normalize(envelope);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventId).toBe('woo-store:wc-order-99');
    }
  });
});
