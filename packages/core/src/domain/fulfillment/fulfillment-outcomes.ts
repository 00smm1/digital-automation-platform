import type { ProvisioningDelivery } from './provisioning-delivery.js';

export type InventoryFulfillmentOutcome = {
  readonly status: 'reserved' | 'consumed' | 'notAttempted' | 'failed';
  readonly reservationReference?: string;
  readonly inventoryItemReference?: string;
  readonly inventoryItemId?: string;
  readonly productReference?: string;
  readonly reservedQuantity?: number;
  readonly reservationStatus?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
};

export type ProvisioningFulfillmentOutcome = {
  readonly status: 'provisioned' | 'notAttempted' | 'failed';
  readonly providerReference?: string;
  readonly executionAttemptReference?: string;
  readonly externalProvisioningReference?: string;
  readonly deliveryMaterialReference?: string;
  readonly delivery?: ProvisioningDelivery;
  readonly failureCode?: string;
  readonly failureReason?: string;
};

export type NotificationFulfillmentOutcome = {
  readonly status: 'sent' | 'notAttempted' | 'failed';
  readonly channel?: string;
  readonly notificationReference?: string;
  readonly failureCode?: string;
  readonly failureReason?: string;
};
