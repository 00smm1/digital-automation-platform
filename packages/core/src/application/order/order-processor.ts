import type { AutomationExecutor } from '../automation/automation-executor.js';
import type { InventoryService } from '../inventory/inventory-service.js';
import type { AutomationContext } from '../../domain/automation/automation-context.js';
import type { ExecutionPlan } from '../../domain/order/execution-plan.js';
import type { OrderProcessingRequest } from '../../domain/order/order-processing-request.js';
import {
  createOrderProcessingResult,
  type OrderProcessingResult,
  type ReservedInventoryEntry,
  type ResolvedProviderEntry,
} from '../../domain/order/order-processing-result.js';
import {
  OrderPipelineNotFoundError,
  OrderProcessingError,
  OrderProviderCapabilityError,
  OrderProviderNotFoundError,
} from '../../domain/order/errors/order-errors.js';
import type { ProviderRegistry } from '../../domain/provider/provider-registry.js';
import type { AutomationResult } from '../../domain/automation/automation-result.js';
import { ProviderResult } from '../../domain/provider/provider-result.js';

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown order processing error';
};

export type OrderProcessorDependencies = {
  readonly inventoryService: InventoryService;
  readonly providerRegistry: ProviderRegistry;
  readonly automationExecutor: AutomationExecutor;
};

/**
 * Executes an order fulfillment plan using inventory, provider, and automation engines.
 */
export class OrderProcessor {
  constructor(private readonly dependencies: OrderProcessorDependencies) {}

  async process(
    plan: ExecutionPlan,
    request: OrderProcessingRequest,
    startedAt: Date,
  ): Promise<OrderProcessingResult> {
    const reservedInventory: ReservedInventoryEntry[] = [];
    const resolvedProviders: ResolvedProviderEntry[] = [];
    const automationResults: AutomationResult[] = [];

    try {
      for (const step of plan.steps) {
        if (step.type === 'reserve-inventory') {
          const inventoryItem = await this.dependencies.inventoryService.reserveNextAvailableItem(
            step.productId,
            step.orderItemId,
          );

          reservedInventory.push({
            orderItemId: step.orderItemId,
            inventoryItemId: inventoryItem.id,
            productId: step.productId,
          });
          continue;
        }

        if (step.type === 'resolve-provider') {
          const provider = this.dependencies.providerRegistry.getProvider(step.providerId);

          if (provider === null) {
            throw new OrderProviderNotFoundError(step.providerId, request.order.id);
          }

          if (!provider.supports(step.capability)) {
            throw new OrderProviderCapabilityError(
              step.providerId,
              step.capability,
              request.order.id,
            );
          }

          const providerResult = await provider.execute({
            capability: step.capability,
            payload: {
              orderId: request.order.id,
              orderItemId: step.orderItemId,
              customerId: request.customer.id,
            },
            metadata: {
              runId: request.runId,
            },
          });

          if (ProviderResult.isFail(providerResult)) {
            throw new OrderProcessingError(providerResult.error.message, request.order.id, {
              cause: providerResult.error,
            });
          }

          resolvedProviders.push({
            orderItemId: step.orderItemId,
            providerId: provider.id,
            capability: step.capability,
          });
          continue;
        }

        const pipeline = request.pipelines[step.pipelineId];

        if (pipeline === undefined) {
          throw new OrderPipelineNotFoundError(step.pipelineId, request.order.id);
        }

        const providerEntry = resolvedProviders.find((entry) =>
          step.orderItemIds.includes(entry.orderItemId),
        );

        const context: AutomationContext = {
          automationId: `order-processing:${request.order.id}`,
          runId: request.runId,
          order: {
            id: request.order.id,
            reference: request.order.reference,
          },
          customer: {
            id: request.customer.id,
            email: request.customer.email,
          },
          payment: request.payment,
          provider:
            providerEntry === undefined
              ? undefined
              : {
                  id: providerEntry.providerId,
                  type: providerEntry.capability,
                },
          metadata: {
            orderItemIds: step.orderItemIds,
            pipelineId: step.pipelineId,
          },
        };

        const automationResult = await this.dependencies.automationExecutor.execute(
          pipeline,
          context,
        );

        automationResults.push(automationResult);

        if (automationResult.status === 'failed') {
          throw new OrderProcessingError(
            automationResult.failureReason ?? `Automation pipeline "${step.pipelineId}" failed.`,
            request.order.id,
          );
        }
      }

      request.order.markCompleted();

      return createOrderProcessingResult({
        runId: request.runId,
        orderId: request.order.id,
        orderStatus: request.order.status,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        reservedInventory,
        resolvedProviders,
        automationResults,
      });
    } catch (error: unknown) {
      try {
        request.order.markFailed();
      } catch {
        // Order may already be in a non-processing state when validation fails early.
      }

      return createOrderProcessingResult({
        runId: request.runId,
        orderId: request.order.id,
        orderStatus: request.order.status,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        reservedInventory,
        resolvedProviders,
        automationResults,
        failureReason: toErrorMessage(error),
      });
    }
  }
}
