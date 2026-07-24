import { describe, expect, it } from 'vitest';

import { createDigitalFulfillmentRequest } from '../../domain/fulfillment/digital-fulfillment-request.js';
import { createTestDigitalFulfillmentStack } from '../../testing/create-test-digital-fulfillment-stack.js';
import { AutomationDefinition } from '../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../domain/automation-definition/condition-group.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE } from './fulfillment-pipeline-step-types.js';
import { CustomerNotificationError } from '../../domain/notification/errors/notification-errors.js';

const createRequest = (
  overrides: Partial<ReturnType<typeof createDigitalFulfillmentRequest>> = {},
) =>
  createDigitalFulfillmentRequest({
    eventId: 'evt-001',
    eventType: 'order.paid',
    externalOrderReference: 'order-1001',
    customerReference: 'customer-42',
    customerEmail: 'customer@example.com',
    productReference: 'digital-premium-12m',
    quantity: 1,
    occurredAt: new Date('2026-07-19T10:00:00.000Z'),
    metadata: { channel: 'test' },
    ...overrides,
  });

describe('DigitalFulfillmentService vertical slice', () => {
  it('completes successful end-to-end fulfillment through orchestration and pipeline', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    const request = createRequest();

    const result = await stack.fulfillmentService.fulfill(request);

    expect(result.status).toBe('completed');
    expect(result.inventoryOutcome.status).toBe('consumed');
    expect(result.provisioningOutcome.status).toBe('provisioned');
    expect(result.notificationOutcome.status).toBe('sent');
    expect(result.completedPipelineSteps).toEqual([
      'Validate Order',
      'Reserve Inventory',
      'Provision Digital Product',
      'Consume Reservation',
      'Notify Customer',
    ]);
    expect(stack.notificationAdapter.getSentNotifications()).toHaveLength(1);
  });

  it('rejects invalid requests before orchestration', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    const request = createRequest({ productReference: '   ' });

    const result = await stack.fulfillmentService.fulfill(request);

    expect(result.status).toBe('rejected');
    expect(result.failureCode).toBe('VALIDATION_FAILED');
    expect(result.inventoryOutcome.status).toBe('notAttempted');
    expect(result.provisioningOutcome.status).toBe('notAttempted');
    expect(result.notificationOutcome.status).toBe('notAttempted');
  });

  it('returns no-match failure when no automation matches', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    const result = await stack.fulfillmentService.fulfill(
      createRequest({ productReference: 'unknown-product' }),
    );

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('NO_MATCH');
    expect(result.inventoryOutcome.status).toBe('notAttempted');
  });

  it('fails when inventory is unavailable and does not provision or notify', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 0 });
    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.status).toBe('failed');
    expect(result.inventoryOutcome.status).toBe('failed');
    expect(result.provisioningOutcome.status).toBe('notAttempted');
    expect(result.notificationOutcome.status).toBe('notAttempted');
    expect(result.failedStep).toBe('Reserve Inventory');
  });

  it('preserves inventory reservation when provisioning fails', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    stack.fakeProviderAdapter.setMode('rejected');

    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.status).toBe('failed');
    expect(result.inventoryOutcome.status).toBe('reserved');
    expect(result.provisioningOutcome.status).toBe('failed');
    expect(result.notificationOutcome.status).toBe('notAttempted');
    expect(result.failedStep).toBe('Provision Digital Product');
  });

  it('preserves provisioning outcome when notification fails', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    stack.notificationAdapter.configureError(
      new CustomerNotificationError('Notification delivery failed.', 'NOTIFICATION_FAILED'),
    );

    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.status).toBe('provisioned');
    expect(result.notificationOutcome.status).toBe('failed');
    expect(result.failedStep).toBe('Notify Customer');
  });

  it('converts unexpected provisioning exceptions into typed failures without leaking secrets', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    stack.fakeProviderAdapter.setMode('throw');
    stack.fakeProviderAdapter.setConfiguredException(new Error('runtime exploded'));

    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.status).toBe('failed');
    expect(result.provisioningOutcome.failureReason).toBe('Digital product provisioning failed.');
    expect(result.provisioningOutcome.failureReason).not.toContain('secret-');
    expect(result.failureReason).not.toContain('secret-');
    expect(result.failureReason).not.toContain('runtime exploded');
  });

  it('executes multiple matched automations in deterministic orchestrator order', async () => {
    const stack = await createTestDigitalFulfillmentStack({ automationId: 'primary-auto' });

    await stack.automationRepository.save(
      AutomationDefinition.create({
        id: createIdentifier('AutomationDefinition', 'secondary-auto'),
        name: 'secondary-auto',
        trigger: AutomationTrigger.create('order.paid'),
        workflowReference: DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE,
        priority: 10,
        conditions: ConditionGroup.create({
          mode: 'ALL',
          conditions: [
            AutomationCondition.create({
              fieldPath: 'product.reference',
              operator: 'equals',
              expectedValue: 'digital-premium-12m',
            }),
          ],
        }),
      }),
    );

    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.status).toBe('completed');
    expect(stack.notificationAdapter.getSentNotifications().length).toBe(1);
  });

  it('supports quantity greater than one when inventory is available', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 3 });
    const result = await stack.fulfillmentService.fulfill(createRequest({ quantity: 2 }));

    expect(result.status).toBe('completed');
    expect(result.inventoryOutcome.reservedQuantity).toBe(2);
  });

  it('does not expose provisioning secrets in failure messages', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    stack.notificationAdapter.configureError(
      new CustomerNotificationError('downstream failure', 'NOTIFICATION_FAILED'),
    );

    const success = await stack.fulfillmentService.fulfill(createRequest());
    const externalReference = success.provisioningOutcome.externalProvisioningReference;

    expect(externalReference).toBeDefined();
    expect(success.notificationOutcome.failureReason).not.toContain(externalReference ?? '');
  });

  it('does not run later pipeline steps after a fatal earlier failure', async () => {
    const stack = await createTestDigitalFulfillmentStack({ inventoryQuantity: 0 });
    const result = await stack.fulfillmentService.fulfill(createRequest());

    expect(result.completedPipelineSteps).toEqual(['Validate Order']);
    expect(result.provisioningOutcome.status).toBe('notAttempted');
    expect(result.notificationOutcome.status).toBe('notAttempted');
  });

  it('keeps the fulfillment request immutable', async () => {
    const stack = await createTestDigitalFulfillmentStack();
    const request = createRequest();
    const snapshot = JSON.stringify(request);

    await stack.fulfillmentService.fulfill(request);

    expect(JSON.stringify(request)).toBe(snapshot);
  });
});
