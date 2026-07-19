import type { ProvisioningDelivery } from '../fulfillment/provisioning-delivery.js';

export type DigitalProductProvisioningRequest = {
  readonly orderReference: string;
  readonly customerReference: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly inventoryItemId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type DigitalProductProvisioningResult = {
  readonly providerReference: string;
  readonly delivery: ProvisioningDelivery;
};

export const createDigitalProductProvisioningRequest = (
  params: DigitalProductProvisioningRequest,
): DigitalProductProvisioningRequest => ({
  orderReference: params.orderReference,
  customerReference: params.customerReference,
  productReference: params.productReference,
  quantity: params.quantity,
  inventoryItemId: params.inventoryItemId,
  metadata: { ...params.metadata },
});

export const createDigitalProductProvisioningResult = (
  params: DigitalProductProvisioningResult,
): DigitalProductProvisioningResult => ({
  providerReference: params.providerReference,
  delivery: params.delivery,
});
