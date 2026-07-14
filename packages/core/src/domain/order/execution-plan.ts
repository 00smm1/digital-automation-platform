import type { ProviderCapability } from '../provider/provider-capability.js';

export type InventoryReservationPlanStep = {
  readonly type: 'reserve-inventory';
  readonly orderItemId: string;
  readonly productId: string;
};

export type ProviderResolutionPlanStep = {
  readonly type: 'resolve-provider';
  readonly orderItemId: string;
  readonly providerId: string;
  readonly capability: ProviderCapability;
};

export type AutomationExecutionPlanStep = {
  readonly type: 'execute-automation';
  readonly pipelineId: string;
  readonly orderItemIds: readonly string[];
};

export type ExecutionPlanStep =
  InventoryReservationPlanStep | ProviderResolutionPlanStep | AutomationExecutionPlanStep;

/**
 * Ordered fulfillment plan derived from an order's item requirements.
 */
export type ExecutionPlan = {
  readonly orderId: string;
  readonly runId: string;
  readonly steps: readonly ExecutionPlanStep[];
};

export const createExecutionPlan = (params: {
  orderId: string;
  runId: string;
  steps: readonly ExecutionPlanStep[];
}): ExecutionPlan => ({
  orderId: params.orderId,
  runId: params.runId,
  steps: params.steps,
});
