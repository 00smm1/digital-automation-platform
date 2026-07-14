import type { OrderProcessingRequest } from '../../domain/order/order-processing-request.js';
import {
  createExecutionPlan,
  type ExecutionPlan,
  type ExecutionPlanStep,
} from '../../domain/order/execution-plan.js';

/**
 * Builds a fulfillment execution plan from order item requirements.
 */
export class ExecutionPlanBuilder {
  build(request: OrderProcessingRequest): ExecutionPlan {
    const steps: ExecutionPlanStep[] = [];

    for (const item of request.order.items) {
      if (item.requirements.requiresInventory) {
        steps.push({
          type: 'reserve-inventory',
          orderItemId: item.id,
          productId: item.productId,
        });
      }
    }

    for (const item of request.order.items) {
      if (item.requirements.requiresProvider) {
        steps.push({
          type: 'resolve-provider',
          orderItemId: item.id,
          providerId: item.providerId!,
          capability: item.providerCapability!,
        });
      }
    }

    const automationSteps = new Map<string, string[]>();

    for (const item of request.order.items) {
      const pipelineId = item.pipelineId ?? request.defaultPipelineId;

      if (pipelineId === undefined) {
        continue;
      }

      const orderItemIds = automationSteps.get(pipelineId) ?? [];
      orderItemIds.push(item.id);
      automationSteps.set(pipelineId, orderItemIds);
    }

    for (const [pipelineId, orderItemIds] of automationSteps) {
      steps.push({
        type: 'execute-automation',
        pipelineId,
        orderItemIds,
      });
    }

    return createExecutionPlan({
      orderId: request.order.id,
      runId: request.runId,
      steps,
    });
  }
}
