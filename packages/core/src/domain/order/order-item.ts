import type { ProviderCapability } from '../provider/provider-capability.js';

export type OrderItemFulfillmentRequirements = {
  readonly requiresInventory: boolean;
  readonly requiresProvider: boolean;
};

export type OrderItem = {
  readonly id: string;
  readonly productId: string;
  readonly quantity: number;
  readonly requirements: OrderItemFulfillmentRequirements;
  readonly providerId?: string;
  readonly providerCapability?: ProviderCapability;
  readonly pipelineId?: string;
};

export const createOrderItem = (params: OrderItem): OrderItem => ({
  id: params.id,
  productId: params.productId,
  quantity: params.quantity,
  requirements: params.requirements,
  providerId: params.providerId,
  providerCapability: params.providerCapability,
  pipelineId: params.pipelineId,
});
