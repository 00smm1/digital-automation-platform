import { describe, expect, it, vi } from 'vitest';

import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { InMemoryInventoryRepository } from '../../domain/inventory/in-memory-inventory-repository.js';
import { InventoryService } from '../inventory/inventory-service.js';
import { AutomationExecutor } from '../automation/automation-executor.js';
import { AutomationPipeline } from '../../domain/automation/automation-pipeline.js';
import type { AutomationStep } from '../../domain/automation/automation-step.js';
import { ProviderRegistry } from '../../domain/provider/provider-registry.js';
import type { Provider } from '../../domain/provider/provider.js';
import type { ProviderConfiguration } from '../../domain/provider/provider-configuration.js';
import type {
  ProviderCapabilities,
  ProviderCapability,
} from '../../domain/provider/provider-capability.js';
import type { ProviderRequest } from '../../domain/provider/provider-request.js';
import type { ProviderResult } from '../../domain/provider/provider-result.js';
import { ProviderResult as ProviderResultFactory } from '../../domain/provider/provider-result.js';
import { ProviderError } from '../../domain/provider/provider-error.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import { Order } from '../../domain/order/order.js';
import { createOrderItem } from '../../domain/order/order-item.js';
import {
  OrderProcessingCompletedEventName,
  OrderProcessingFailedEventName,
  OrderProcessingStartedEventName,
} from '../../domain/order/events/order-events.js';
import type { DomainEvent } from '../../domain/events/domain-event.js';
import { OrderProcessingService } from './order-processing-service.js';
import { OrderValidator } from './order-validator.js';
import { ExecutionPlanBuilder } from './execution-plan-builder.js';
import { OrderProcessor } from './order-processor.js';
import { ProcessOrderCommandHandler } from './handlers/process-order.handler.js';
import { createProcessOrderCommand } from './commands/process-order.command.js';

const createSuccessStep = (stepName: string): AutomationStep => ({
  stepName,
  async execute() {
    const timestamp = new Date();

    return {
      stepName,
      status: 'success',
      startedAt: timestamp,
      completedAt: timestamp,
      attempts: 1,
    };
  },
});

const createStubProvider = (params: {
  id: string;
  capabilities: ProviderCapabilities;
  executeHandler?: (request: ProviderRequest) => Promise<ProviderResult>;
}): Provider => {
  const configuration: ProviderConfiguration = {
    providerId: params.id,
    providerType: 'generic',
    settings: {},
  };

  return {
    id: params.id,
    name: params.id,
    providerType: 'generic',
    configuration,
    capabilities: params.capabilities,
    supports(capability: ProviderCapability) {
      return params.capabilities.includes(capability);
    },
    async execute(request) {
      if (!this.supports(request.capability)) {
        return ProviderResultFactory.fail(
          new ProviderError(
            'PROVIDER_CAPABILITY_UNSUPPORTED',
            `Capability "${request.capability}" is not supported.`,
            params.id,
            request.capability,
          ),
        );
      }

      if (params.executeHandler !== undefined) {
        return params.executeHandler(request);
      }

      return ProviderResultFactory.ok({
        capability: request.capability,
        providerId: params.id,
        data: { ok: true },
      });
    },
    async checkHealth() {
      return {
        providerId: params.id,
        healthy: true,
        checkedAt: new Date(),
      };
    },
  };
};

const createProcessingStack = () => {
  const eventBus = new InMemoryEventBus();
  const inventoryRepository = new InMemoryInventoryRepository();
  const inventoryService = new InventoryService({ repository: inventoryRepository, eventBus });
  const providerRegistry = new ProviderRegistry();
  const automationExecutor = new AutomationExecutor({ eventBus });
  const validator = new OrderValidator();
  const planBuilder = new ExecutionPlanBuilder();
  const processor = new OrderProcessor({
    inventoryService,
    providerRegistry,
    automationExecutor,
  });
  const service = new OrderProcessingService({
    eventBus,
    inventoryService,
    providerRegistry,
    automationExecutor,
    validator,
    planBuilder,
    processor,
  });

  const published: DomainEvent[] = [];

  eventBus.subscribe(OrderProcessingStartedEventName, {
    eventName: OrderProcessingStartedEventName,
    handle(event) {
      published.push(event);
    },
  });

  eventBus.subscribe(OrderProcessingCompletedEventName, {
    eventName: OrderProcessingCompletedEventName,
    handle(event) {
      published.push(event);
    },
  });

  eventBus.subscribe(OrderProcessingFailedEventName, {
    eventName: OrderProcessingFailedEventName,
    handle(event) {
      published.push(event);
    },
  });

  return {
    service,
    inventoryService,
    inventoryRepository,
    providerRegistry,
    eventBus,
    published,
  };
};

describe('ExecutionPlanBuilder', () => {
  it('builds inventory, provider, and automation steps based on item requirements', () => {
    const builder = new ExecutionPlanBuilder();
    const order = Order.create({
      id: createIdentifier('Order', 'order-1'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-inventory',
          productId: 'product-code',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: false },
        }),
        createOrderItem({
          id: 'item-provider',
          productId: 'product-subscription',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: true },
          providerId: 'provider-1',
          providerCapability: 'CreateAccount',
        }),
        createOrderItem({
          id: 'item-both',
          productId: 'product-bundle',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: true },
          providerId: 'provider-1',
          providerCapability: 'CreateAccount',
          pipelineId: 'pipeline-bundle',
        }),
        createOrderItem({
          id: 'item-neither',
          productId: 'product-info',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: false },
        }),
      ],
    });

    const plan = builder.build({
      runId: 'run-1',
      order,
      customer: { id: 'customer-1' },
      pipelines: {
        'pipeline-bundle': new AutomationPipeline({
          id: 'pipeline-bundle',
          steps: [createSuccessStep('deliver')],
        }),
      },
    });

    expect(plan.steps).toEqual([
      { type: 'reserve-inventory', orderItemId: 'item-inventory', productId: 'product-code' },
      { type: 'reserve-inventory', orderItemId: 'item-both', productId: 'product-bundle' },
      {
        type: 'resolve-provider',
        orderItemId: 'item-provider',
        providerId: 'provider-1',
        capability: 'CreateAccount',
      },
      {
        type: 'resolve-provider',
        orderItemId: 'item-both',
        providerId: 'provider-1',
        capability: 'CreateAccount',
      },
      {
        type: 'execute-automation',
        pipelineId: 'pipeline-bundle',
        orderItemIds: ['item-both'],
      },
    ]);
  });
});

describe('OrderProcessingService', () => {
  it('processes an order that requires inventory only', async () => {
    const { service, inventoryService } = createProcessingStack();

    await inventoryService.addItem({
      id: createIdentifier('InventoryItem', 'inv-1'),
      productId: 'product-code',
      type: 'code',
      payload: { code: 'ABC-123' },
    });

    const order = Order.create({
      id: createIdentifier('Order', 'order-inventory'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-1',
          productId: 'product-code',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: false },
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-inventory',
      order,
      customer: { id: 'customer-1', email: 'customer@example.com' },
      pipelines: {},
    });

    expect(result.status).toBe('completed');
    expect(result.reservedInventory).toHaveLength(1);
    expect(result.reservedInventory[0]?.orderItemId).toBe('item-1');
    expect(order.status).toBe('completed');
  });

  it('processes an order that requires provider only', async () => {
    const { service, providerRegistry } = createProcessingStack();

    providerRegistry.registerProvider(
      createStubProvider({
        id: 'provider-1',
        capabilities: ['CreateAccount'],
      }),
    );

    const order = Order.create({
      id: createIdentifier('Order', 'order-provider'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-1',
          productId: 'product-subscription',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: true },
          providerId: 'provider-1',
          providerCapability: 'CreateAccount',
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-provider',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(result.status).toBe('completed');
    expect(result.resolvedProviders).toHaveLength(1);
    expect(result.resolvedProviders[0]?.providerId).toBe('provider-1');
    expect(order.status).toBe('completed');
  });

  it('processes an order that requires inventory, provider, and automation', async () => {
    const { service, inventoryService, providerRegistry } = createProcessingStack();
    const automationStep = createSuccessStep('provision');
    const executeSpy = vi.spyOn(automationStep, 'execute');

    await inventoryService.addItem({
      id: createIdentifier('InventoryItem', 'inv-1'),
      productId: 'product-bundle',
      type: 'account',
      payload: { username: 'user-1' },
    });

    providerRegistry.registerProvider(
      createStubProvider({
        id: 'provider-1',
        capabilities: ['CreateAccount'],
      }),
    );

    const order = Order.create({
      id: createIdentifier('Order', 'order-bundle'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-1',
          productId: 'product-bundle',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: true },
          providerId: 'provider-1',
          providerCapability: 'CreateAccount',
          pipelineId: 'pipeline-bundle',
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-bundle',
      order,
      customer: { id: 'customer-1' },
      pipelines: {
        'pipeline-bundle': new AutomationPipeline({
          id: 'pipeline-bundle',
          steps: [automationStep],
        }),
      },
    });

    expect(result.status).toBe('completed');
    expect(result.reservedInventory).toHaveLength(1);
    expect(result.resolvedProviders).toHaveLength(1);
    expect(result.automationResults).toHaveLength(1);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(order.status).toBe('completed');
  });

  it('processes an order with multiple items and mixed requirements', async () => {
    const { service, inventoryService, providerRegistry } = createProcessingStack();

    await inventoryService.addItem({
      id: createIdentifier('InventoryItem', 'inv-1'),
      productId: 'product-code',
      type: 'code',
      payload: { code: 'CODE-1' },
    });

    providerRegistry.registerProvider(
      createStubProvider({
        id: 'provider-1',
        capabilities: ['CreateAccount'],
      }),
    );

    const order = Order.create({
      id: createIdentifier('Order', 'order-mixed'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-inventory',
          productId: 'product-code',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: false },
        }),
        createOrderItem({
          id: 'item-provider',
          productId: 'product-subscription',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: true },
          providerId: 'provider-1',
          providerCapability: 'CreateAccount',
        }),
        createOrderItem({
          id: 'item-neither',
          productId: 'product-info',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: false },
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-mixed',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(result.status).toBe('completed');
    expect(result.reservedInventory).toHaveLength(1);
    expect(result.resolvedProviders).toHaveLength(1);
    expect(order.status).toBe('completed');
  });

  it('fails validation when the order has no items', async () => {
    const { service, published } = createProcessingStack();
    const order = Order.create({
      id: createIdentifier('Order', 'order-empty'),
      customerId: 'customer-1',
      items: [],
    });

    const result = await service.process({
      runId: 'run-empty',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('at least one item');
    expect(order.status).toBe('pending');
    expect(published.map((event) => event.eventName)).toEqual([
      OrderProcessingStartedEventName,
      OrderProcessingFailedEventName,
    ]);
  });

  it('fails when inventory is out of stock', async () => {
    const { service, published } = createProcessingStack();
    const order = Order.create({
      id: createIdentifier('Order', 'order-oos'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-1',
          productId: 'missing-product',
          quantity: 1,
          requirements: { requiresInventory: true, requiresProvider: false },
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-oos',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('No available inventory items remain');
    expect(order.status).toBe('failed');
    expect(published.at(-1)?.eventName).toBe(OrderProcessingFailedEventName);
  });

  it('fails when the provider is not registered', async () => {
    const { service } = createProcessingStack();
    const order = Order.create({
      id: createIdentifier('Order', 'order-missing-provider'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-1',
          productId: 'product-subscription',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: true },
          providerId: 'missing-provider',
          providerCapability: 'CreateAccount',
        }),
      ],
    });

    const result = await service.process({
      runId: 'run-missing-provider',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('missing-provider');
    expect(order.status).toBe('failed');
  });

  it('publishes started and completed events on success', async () => {
    const { service, published } = createProcessingStack();
    const order = Order.create({
      id: createIdentifier('Order', 'order-events'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-neither',
          productId: 'product-info',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: false },
        }),
      ],
    });

    await service.process({
      runId: 'run-events',
      order,
      customer: { id: 'customer-1' },
      pipelines: {},
    });

    expect(published.map((event) => event.eventName)).toEqual([
      OrderProcessingStartedEventName,
      OrderProcessingCompletedEventName,
    ]);
  });

  it('delegates through the CQRS command handler', async () => {
    const { service } = createProcessingStack();
    const handler = new ProcessOrderCommandHandler(service);
    const order = Order.create({
      id: createIdentifier('Order', 'order-cqrs'),
      customerId: 'customer-1',
      items: [
        createOrderItem({
          id: 'item-neither',
          productId: 'product-info',
          quantity: 1,
          requirements: { requiresInventory: false, requiresProvider: false },
        }),
      ],
    });

    const result = await handler.execute(
      createProcessOrderCommand({
        runId: 'run-cqrs',
        order,
        customer: { id: 'customer-1' },
        pipelines: {},
      }),
    );

    expect(result.status).toBe('completed');
    expect(handler.commandName).toBe('order.process');
  });
});
