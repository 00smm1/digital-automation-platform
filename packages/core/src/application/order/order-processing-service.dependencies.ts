import type { EventBus } from '../events/event-bus.js';
import type { AutomationExecutor } from '../automation/automation-executor.js';
import type { InventoryService } from '../inventory/inventory-service.js';
import type { ProviderRegistry } from '../../domain/provider/provider-registry.js';
import type { OrderValidator } from './order-validator.js';
import type { ExecutionPlanBuilder } from './execution-plan-builder.js';
import type { OrderProcessor } from './order-processor.js';

export type OrderProcessingServiceDependencies = {
  readonly eventBus: EventBus;
  readonly inventoryService: InventoryService;
  readonly providerRegistry: ProviderRegistry;
  readonly automationExecutor: AutomationExecutor;
  readonly validator: OrderValidator;
  readonly planBuilder: ExecutionPlanBuilder;
  readonly processor: OrderProcessor;
};
