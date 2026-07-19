import type { FulfillmentStatus } from './fulfillment-status.js';
import type {
  InventoryFulfillmentOutcome,
  NotificationFulfillmentOutcome,
  ProvisioningFulfillmentOutcome,
} from './fulfillment-outcomes.js';

/**
 * Structured business result of a digital fulfillment operation.
 */
export type DigitalFulfillmentResult = {
  readonly executionId: string;
  readonly eventId: string;
  readonly externalOrderReference: string;
  readonly status: FulfillmentStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly inventoryOutcome: InventoryFulfillmentOutcome;
  readonly provisioningOutcome: ProvisioningFulfillmentOutcome;
  readonly notificationOutcome: NotificationFulfillmentOutcome;
  readonly completedPipelineSteps: readonly string[];
  readonly failedStep?: string;
  readonly failureReason?: string;
  readonly failureCode?: string;
};

export const createDigitalFulfillmentResult = (
  params: DigitalFulfillmentResult,
): DigitalFulfillmentResult => params;
