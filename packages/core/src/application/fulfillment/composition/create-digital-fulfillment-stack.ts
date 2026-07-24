import { InMemoryEventBus } from '../../events/in-memory-event-bus.js';
import { InMemoryAutomationDefinitionRepository } from '../../../domain/automation-definition/in-memory-automation-definition-repository.js';
import { InMemoryWorkflowDefinitionRepository } from '../../../domain/workflow-pipeline/in-memory-workflow-definition-repository.js';
import { AutomationMatcher } from '../../automation-definition/automation-matcher.js';
import { PlatformEventOrchestrator } from '../../orchestration/platform-event-orchestrator.js';
import { PipelineWorkflowExecutionPort } from '../../orchestration/pipeline-workflow-execution-port.js';
import { PipelineRunner } from '../../workflow-pipeline/pipeline-runner.js';
import {
  createDigitalProviderRuntimeComposition,
  type ProviderRuntimePort,
} from '@dap/provider-runtime';
import type { FakeProviderAdapter } from '@dap/provider-runtime';
import { InMemoryCustomerNotificationAdapter } from '../adapters/in-memory-customer-notification-adapter.js';
import { QuantityInventoryReservationAdapter } from '../adapters/quantity-inventory-reservation-adapter.js';
import { DigitalFulfillmentService } from '../digital-fulfillment-service.js';
import { createDigitalFulfillmentStepRegistry } from '../../workflow-pipeline/create-digital-fulfillment-step-registry.js';
import { createDigitalProductFulfillmentWorkflowDefinition } from '../../workflow-pipeline/fixtures/digital-product-fulfillment-workflow.js';
import { AutomationDefinition } from '../../../domain/automation-definition/automation-definition.js';
import { AutomationTrigger } from '../../../domain/automation-definition/automation-trigger.js';
import { AutomationCondition } from '../../../domain/automation-definition/automation-condition.js';
import { ConditionGroup } from '../../../domain/automation-definition/condition-group.js';
import { createIdentifier } from '../../../shared/types/identifier.js';
import { DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE } from '../fulfillment-pipeline-step-types.js';
import { FakeClock } from '../../../shared/time/clock.js';
import { InMemoryInventoryReservationRepository } from '../../../domain/inventory/in-memory-inventory-reservation-repository.js';
import { InventoryReservationService } from '../../inventory/inventory-reservation-service.js';
import { createCompositionReservationReferenceFactory } from '../../inventory/reservation-policy.js';
import { createQuantityInventoryRecord } from '../../../domain/inventory/quantity-inventory-record.js';
import { createInventoryItemReference } from '../../../domain/inventory/inventory-references.js';

export type DigitalFulfillmentStack = {
  readonly clock: FakeClock;
  readonly eventBus: InMemoryEventBus;
  readonly automationRepository: InMemoryAutomationDefinitionRepository;
  readonly workflowDefinitionRepository: InMemoryWorkflowDefinitionRepository;
  readonly inventoryReservationRepository: InMemoryInventoryReservationRepository;
  readonly inventoryReservationService: InventoryReservationService;
  readonly inventoryReservationAdapter: QuantityInventoryReservationAdapter;
  readonly providerRuntimePort: ProviderRuntimePort;
  readonly providerRuntimeComposition: ReturnType<typeof createDigitalProviderRuntimeComposition>;
  readonly fakeProviderAdapter?: FakeProviderAdapter;
  readonly notificationAdapter: InMemoryCustomerNotificationAdapter;
  readonly orchestrator: PlatformEventOrchestrator;
  readonly fulfillmentService: DigitalFulfillmentService;
};

export type CreateDigitalFulfillmentStackOptions = {
  readonly productReference?: string;
  readonly automationId?: string;
  readonly inventoryQuantity?: number;
  readonly clock?: FakeClock;
  readonly reservationReferenceFactory?: import('../../inventory/reservation-policy.js').ReservationReferenceFactory;
  readonly providerRuntimePort?: ProviderRuntimePort;
  readonly fakeProviderAdapter?: FakeProviderAdapter;
};

export const createDigitalFulfillmentStack = async (
  options: CreateDigitalFulfillmentStackOptions = {},
): Promise<DigitalFulfillmentStack> => {
  const productReference = options.productReference ?? 'digital-premium-12m';
  const automationId = options.automationId ?? 'digital-premium-fulfillment';
  const inventoryQuantity = options.inventoryQuantity ?? 5;
  const clock = options.clock ?? new FakeClock();

  const eventBus = new InMemoryEventBus();
  const automationRepository = new InMemoryAutomationDefinitionRepository();
  const workflowDefinitionRepository = new InMemoryWorkflowDefinitionRepository();
  const inventoryReservationRepository = new InMemoryInventoryReservationRepository();
  const inventoryReservationService = new InventoryReservationService({
    repository: inventoryReservationRepository,
    clock,
    reservationReferenceFactory:
      options.reservationReferenceFactory ?? createCompositionReservationReferenceFactory(),
  });
  const inventoryReservationAdapter = new QuantityInventoryReservationAdapter(
    inventoryReservationService,
  );
  const providerRuntimeComposition = createDigitalProviderRuntimeComposition({ clock });
  const providerRuntimePort =
    options.providerRuntimePort ?? providerRuntimeComposition.providerRuntime;
  const notificationAdapter = new InMemoryCustomerNotificationAdapter();

  const inventoryItemReference = createInventoryItemReference(productReference);
  const inventoryRecordResult = createQuantityInventoryRecord({
    inventoryItemReference,
    totalQuantity: inventoryQuantity,
  });

  if (!inventoryRecordResult.ok) {
    throw new Error('Failed to seed inventory record.');
  }

  await inventoryReservationRepository.saveInventoryItem(inventoryRecordResult.value);

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
    reservationLifecyclePort: inventoryReservationAdapter,
    providerRuntimePort,
    notificationPort: notificationAdapter,
    clock,
  });

  const pipelineRunner = new PipelineRunner({ stepExecutorRegistry: stepRegistry, clock });
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
    clock,
    eventBus,
    automationRepository,
    workflowDefinitionRepository,
    inventoryReservationRepository,
    inventoryReservationService,
    inventoryReservationAdapter,
    providerRuntimePort,
    providerRuntimeComposition,
    fakeProviderAdapter: options.fakeProviderAdapter,
    notificationAdapter,
    orchestrator,
    fulfillmentService,
  };
};
