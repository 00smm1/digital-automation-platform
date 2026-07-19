import { InMemoryEventBus } from '../../events/in-memory-event-bus.js';
import { InMemoryAutomationDefinitionRepository } from '../../../domain/automation-definition/in-memory-automation-definition-repository.js';
import { InMemoryInventoryRepository } from '../../../domain/inventory/in-memory-inventory-repository.js';
import { InMemoryWorkflowDefinitionRepository } from '../../../domain/workflow-pipeline/in-memory-workflow-definition-repository.js';
import { AutomationMatcher } from '../../automation-definition/automation-matcher.js';
import { PlatformEventOrchestrator } from '../../orchestration/platform-event-orchestrator.js';
import { PipelineWorkflowExecutionPort } from '../../orchestration/pipeline-workflow-execution-port.js';
import { PipelineRunner } from '../../workflow-pipeline/pipeline-runner.js';
import { InventoryService } from '../../inventory/inventory-service.js';
import { InventoryReservationAdapter } from '../adapters/inventory-reservation-adapter.js';
import { FakeDigitalProductProvisioningAdapter } from '../adapters/fake-digital-product-provisioning-adapter.js';
import { InMemoryCustomerNotificationAdapter } from '../adapters/in-memory-customer-notification-adapter.js';
import { DigitalFulfillmentService } from '../digital-fulfillment-service.js';
import { createDigitalFulfillmentStepRegistry } from '../../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import { createDigitalProductFulfillmentWorkflowDefinition } from '../../workflow-pipeline/fixtures/digital-product-fulfillment-workflow.js';
import { AutomationDefinition } from '../../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../../domain/automation-definition/condition-group.js';
import { createIdentifier } from '../../../shared/types/identifier.js';
import { DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE } from '../fulfillment-pipeline-step-types.js';
import type { InventoryItemType } from '../../../domain/inventory/inventory-item-type.js';

export type DigitalFulfillmentStack = {
  readonly eventBus: InMemoryEventBus;
  readonly automationRepository: InMemoryAutomationDefinitionRepository;
  readonly workflowDefinitionRepository: InMemoryWorkflowDefinitionRepository;
  readonly inventoryRepository: InMemoryInventoryRepository;
  readonly inventoryService: InventoryService;
  readonly inventoryReservationAdapter: InventoryReservationAdapter;
  readonly provisioningAdapter: FakeDigitalProductProvisioningAdapter;
  readonly notificationAdapter: InMemoryCustomerNotificationAdapter;
  readonly orchestrator: PlatformEventOrchestrator;
  readonly fulfillmentService: DigitalFulfillmentService;
};

export type CreateDigitalFulfillmentStackOptions = {
  readonly productReference?: string;
  readonly automationId?: string;
  readonly inventoryQuantity?: number;
};

export const createDigitalFulfillmentStack = async (
  options: CreateDigitalFulfillmentStackOptions = {},
): Promise<DigitalFulfillmentStack> => {
  const productReference = options.productReference ?? 'digital-premium-12m';
  const automationId = options.automationId ?? 'digital-premium-fulfillment';
  const inventoryQuantity = options.inventoryQuantity ?? 5;

  const eventBus = new InMemoryEventBus();
  const automationRepository = new InMemoryAutomationDefinitionRepository();
  const workflowDefinitionRepository = new InMemoryWorkflowDefinitionRepository();
  const inventoryRepository = new InMemoryInventoryRepository();
  const inventoryService = new InventoryService({ repository: inventoryRepository, eventBus });
  const inventoryReservationAdapter = new InventoryReservationAdapter(inventoryService);
  const provisioningAdapter = new FakeDigitalProductProvisioningAdapter();
  const notificationAdapter = new InMemoryCustomerNotificationAdapter();

  for (let index = 0; index < inventoryQuantity; index += 1) {
    await inventoryService.addItem({
      id: createIdentifier('InventoryItem', `${productReference}-item-${index}`),
      productId: productReference,
      type: 'license' as InventoryItemType,
      payload: { code: `CODE-${index}` },
    });
  }

  await workflowDefinitionRepository.save(createDigitalProductFulfillmentWorkflowDefinition());

  await automationRepository.save(
    AutomationDefinition.create({
      id: createIdentifier('AutomationDefinition', automationId),
      name: automationId,
      trigger: AutomationTrigger.create('order.paid'),
      workflowReference: DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE,
      priority: 100,
      conditions: ConditionGroup.create({
        mode: 'ALL',
        conditions: [
          AutomationCondition.create({
            fieldPath: 'product.reference',
            operator: 'equals',
            expectedValue: productReference,
          }),
        ],
      }),
    }),
  );

  const stepRegistry = createDigitalFulfillmentStepRegistry({
    inventoryReservationPort: inventoryReservationAdapter,
    provisioningPort: provisioningAdapter,
    notificationPort: notificationAdapter,
  });

  const pipelineRunner = new PipelineRunner({ stepExecutorRegistry: stepRegistry });
  const workflowExecutionPort = new PipelineWorkflowExecutionPort({
    pipelineRunner,
    workflowDefinitionRepository,
  });
  const matcher = new AutomationMatcher({ repository: automationRepository });
  const orchestrator = new PlatformEventOrchestrator({
    matcher,
    workflowExecutionPort,
  });
  const fulfillmentService = new DigitalFulfillmentService({ orchestrator });

  return {
    eventBus,
    automationRepository,
    workflowDefinitionRepository,
    inventoryRepository,
    inventoryService,
    inventoryReservationAdapter,
    provisioningAdapter,
    notificationAdapter,
    orchestrator,
    fulfillmentService,
  };
};
