import type { AutomationResult } from '../automation/automation-result.js';
import type { InventoryItemId } from '../inventory/inventory-item.js';
import type { ProviderCapability } from '../provider/provider-capability.js';
import type { OrderStatus } from './order-status.js';

export type OrderProcessingResultStatus = 'completed' | 'failed';

export type ReservedInventoryEntry = {
  readonly orderItemId: string;
  readonly inventoryItemId: InventoryItemId;
  readonly productId: string;
};

export type ResolvedProviderEntry = {
  readonly orderItemId: string;
  readonly providerId: string;
  readonly capability: ProviderCapability;
};

/**
 * Final outcome of an order processing run.
 */
export type OrderProcessingResult = {
  readonly runId: string;
  readonly orderId: string;
  readonly orderStatus: OrderStatus;
  readonly status: OrderProcessingResultStatus;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly reservedInventory: readonly ReservedInventoryEntry[];
  readonly resolvedProviders: readonly ResolvedProviderEntry[];
  readonly automationResults: readonly AutomationResult[];
  readonly failureReason?: string;
};

export const createOrderProcessingResult = (params: {
  runId: string;
  orderId: string;
  orderStatus: OrderStatus;
  status: OrderProcessingResultStatus;
  startedAt: Date;
  completedAt: Date;
  reservedInventory?: readonly ReservedInventoryEntry[];
  resolvedProviders?: readonly ResolvedProviderEntry[];
  automationResults?: readonly AutomationResult[];
  failureReason?: string;
}): OrderProcessingResult => ({
  runId: params.runId,
  orderId: params.orderId,
  orderStatus: params.orderStatus,
  status: params.status,
  startedAt: params.startedAt,
  completedAt: params.completedAt,
  reservedInventory: params.reservedInventory ?? [],
  resolvedProviders: params.resolvedProviders ?? [],
  automationResults: params.automationResults ?? [],
  failureReason: params.failureReason,
});
