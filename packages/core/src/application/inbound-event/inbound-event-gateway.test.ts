import { describe, expect, it } from 'vitest';

import { PlatformEventOrchestrator } from '../orchestration/platform-event-orchestrator.js';
import { InboundEventGateway } from './inbound-event-gateway.js';
import {
  createTestInboundGatewayStack,
  type InboundGatewayStack,
} from '../../testing/create-test-inbound-gateway-stack.js';
import {
  createValidExternalOrderPaidEnvelope,
  FakeInboundEventAdapter,
} from './fake-inbound-event-adapter.js';
import { createExternalEventEnvelope } from '../../domain/inbound-event/external-event-envelope.js';
import {
  IdempotencyStoreError,
  InboundEventNormalizationError,
} from '../../domain/inbound-event/errors/inbound-event-errors.js';
import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import type { PlatformEventOrchestrationResult } from '../../domain/orchestration/platform-event-orchestration-result.js';

const createThrowingOrchestrator = (): PlatformEventOrchestrator =>
  ({
    process: async (_event: NormalizedPlatformEvent): Promise<PlatformEventOrchestrationResult> => {
      throw new Error('orchestrator runtime exploded');
    },
  }) as PlatformEventOrchestrator;

const processEnvelope = async (
  stack: InboundGatewayStack,
  overrides: Parameters<typeof createValidExternalOrderPaidEnvelope>[0] = {},
) => {
  const envelope = createValidExternalOrderPaidEnvelope(overrides);
  return stack.inboundGateway.process(envelope, stack.inboundAdapter);
};

describe('InboundEventGateway end-to-end', () => {
  it('normalizes and processes a valid external event through orchestration and pipeline', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.status).toBe('processed');
    expect(result.idempotencyState).toBe('completed');
    expect(result.orchestrationResult?.overallStatus).toBe('succeeded');
    expect(result.orchestrationResult?.successfulExecutionCount).toBe(1);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
  });

  it('rejects malformed external events without claiming idempotency', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope({
        payload: {
          orderId: '',
          customerId: 'x',
          customerEmail: 'a@b.com',
          productReference: 'p',
          quantity: 1,
        },
      }),
      stack.inboundAdapter,
    );

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('MALFORMED_PAYLOAD');
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('rejects unsupported external event types without claiming idempotency', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await stack.inboundGateway.process(
      createValidExternalOrderPaidEnvelope({ eventType: 'order.cancelled' }),
      stack.inboundAdapter,
    );

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('UNSUPPORTED_EVENT_TYPE');
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
  });

  it('does not process duplicate events twice', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    const first = await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const second = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
  });

  it('returns completed duplicate information for already completed events', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const duplicate = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.idempotencyState).toBe('completed');
    expect(duplicate.failureCode).toBe('ALREADY_COMPLETED');
  });

  it('returns failed duplicate state without automatic retry', async () => {
    const stack = await createTestInboundGatewayStack({ inventoryQuantity: 0 });
    const envelope = createValidExternalOrderPaidEnvelope();

    const failed = await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    const duplicate = await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(failed.status).toBe('failed');
    expect(failed.idempotencyState).toBe('failed');
    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.idempotencyState).toBe('failed');
    expect(duplicate.failureCode).toBe('ALREADY_FAILED');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
  });

  it('allows only one successful claim for concurrent submissions of the same key', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    const [first, second] = await Promise.all([
      stack.inboundGateway.process(envelope, stack.inboundAdapter),
      stack.inboundGateway.process(envelope, stack.inboundAdapter),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['duplicate', 'processed']);
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(1);
  });

  it('treats the same external event id from different sources separately', async () => {
    const stack = await createTestInboundGatewayStack();
    const sharedExternalId = 'shared-ext-id';

    const first = await processEnvelope(stack, {
      sourceId: 'store-a',
      externalEventId: sharedExternalId,
    });
    const second = await processEnvelope(stack, {
      sourceId: 'store-b',
      externalEventId: sharedExternalId,
    });

    expect(first.status).toBe('processed');
    expect(second.status).toBe('processed');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(2);
  });

  it('processes different external event ids from the same source separately', async () => {
    const stack = await createTestInboundGatewayStack();

    const first = await processEnvelope(stack, { externalEventId: 'evt-a' });
    const second = await processEnvelope(stack, { externalEventId: 'evt-b' });

    expect(first.status).toBe('processed');
    expect(second.status).toBe('processed');
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(2);
  });

  it('does not create an idempotency record when normalization fails', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.inboundAdapter.configureError(
      new InboundEventNormalizationError('Configured normalization failure.', 'CONFIGURED_FAILURE'),
    );

    const result = await processEnvelope(stack);

    expect(result.status).toBe('rejected');
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
  });

  it('prevents orchestration when idempotency claim fails at the store', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.idempotencyStore.configureClaimFailure(
      new IdempotencyStoreError('Configured idempotency store failure.', 'CLAIM_STORE_FAILURE'),
    );

    const result = await processEnvelope(stack);

    expect(result.status).toBe('claimFailed');
    expect(result.failureCode).toBe('CLAIM_STORE_FAILURE');
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(0);
    expect(stack.idempotencyStore.getAllRecords()).toHaveLength(0);
  });

  it('marks idempotency as failed when orchestration fails', async () => {
    const stack = await createTestInboundGatewayStack({ inventoryQuantity: 0 });
    const result = await processEnvelope(stack);

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('ORCHESTRATION_FAILED');
    expect(result.orchestrationResult?.overallStatus).toBe('failed');

    const record = await stack.idempotencyStore.findByKey(result.idempotencyKey!);
    expect(record?.state).toBe('failed');
  });

  it('converts unexpected adapter exceptions into typed normalization failures', async () => {
    const stack = await createTestInboundGatewayStack();
    stack.inboundAdapter.configureException(new Error('adapter runtime exploded'));

    const result = await processEnvelope(stack);

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('ADAPTER_EXCEPTION');
    expect(result.failureReason).not.toContain('runtime exploded');
  });

  it('converts unexpected orchestrator exceptions into typed processing failures', async () => {
    const stack = await createTestInboundGatewayStack();
    const gateway = new InboundEventGateway({
      idempotencyStore: stack.idempotencyStore,
      orchestrator: createThrowingOrchestrator(),
    });

    const result = await gateway.process(
      createValidExternalOrderPaidEnvelope(),
      stack.inboundAdapter,
    );

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('PROCESSING_EXCEPTION');
    expect(result.failureReason).not.toContain('runtime exploded');
    expect(result.idempotencyState).toBe('failed');
  });

  it('does not include sensitive payload values in failure messages', async () => {
    const stack = await createTestInboundGatewayStack();
    const secretToken = 'super-secret-auth-token-12345';

    const result = await stack.inboundGateway.process(
      createExternalEventEnvelope({
        sourceId: 'test-store',
        externalEventId: 'evt-secret',
        eventType: 'order.paid',
        receivedAt: new Date('2026-07-20T06:00:00.000Z'),
        payload: { invalid: true },
        headers: { authorization: secretToken },
        metadata: { apiKey: secretToken },
      }),
      stack.inboundAdapter,
    );

    const serialized = JSON.stringify(result);
    expect(result.status).toBe('rejected');
    expect(serialized).not.toContain(secretToken);
  });

  it('preserves external event envelope immutability during processing', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();
    const snapshot = JSON.stringify(envelope);

    await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(JSON.stringify(envelope)).toBe(snapshot);
  });

  it('uses the real orchestrator and workflow pipeline rather than bypassing them', async () => {
    const stack = await createTestInboundGatewayStack();
    const result = await processEnvelope(stack);

    expect(result.orchestrationResult?.executionOutcomes).toHaveLength(1);
    const outcome = result.orchestrationResult?.executionOutcomes[0];
    expect(outcome?.status).toBe('succeeded');
    expect(outcome?.pipelineExecutionResult?.completedSteps.map((step) => step.stepName)).toEqual([
      'Validate Order',
      'Reserve Inventory',
      'Provision Digital Product',
      'Consume Reservation',
      'Notify Customer',
    ]);
    expect(stack.orchestrator).toBeInstanceOf(PlatformEventOrchestrator);
  });

  it('executes inventory, provisioning, and notification only once for duplicate submissions', async () => {
    const stack = await createTestInboundGatewayStack();
    const envelope = createValidExternalOrderPaidEnvelope();

    await stack.inboundGateway.process(envelope, stack.inboundAdapter);
    await stack.inboundGateway.process(envelope, stack.inboundAdapter);

    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
    expect(stack.fakeProviderAdapter.getInvocationCount()).toBe(1);
  });
});

describe('FakeInboundEventAdapter', () => {
  it('maps valid envelopes to deterministic normalized event identifiers', async () => {
    const adapter = new FakeInboundEventAdapter();
    const envelope = createValidExternalOrderPaidEnvelope({
      sourceId: 'woo-store',
      externalEventId: 'wc-order-99',
    });

    const result = await adapter.normalize(envelope);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventId).toBe('woo-store:wc-order-99');
      expect(result.value.eventType).toBe('order.paid');
    }
  });
});
