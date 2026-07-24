import { InMemoryPipelineStepExecutorRegistry } from './in-memory-pipeline-step-executor-registry.js';
import type { InventoryReservationPort } from '../fulfillment/ports/inventory-reservation-port.js';
import type { InventoryReservationLifecyclePort } from '../fulfillment/ports/inventory-reservation-port.js';
import type { ProviderRuntimePort } from '@dap/provider-runtime';
import type { CustomerNotificationPort } from '../fulfillment/ports/customer-notification-port.js';
import { DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES } from '../fulfillment/fulfillment-pipeline-step-types.js';
import type { Clock } from '../../shared/time/clock.js';
import { createValidateOrderStepExecutor } from './steps/validate-order-step-executor.js';
import { createReserveInventoryStepExecutor } from './steps/reserve-inventory-step-executor.js';
import { createProvisionDigitalProductStepExecutor } from './steps/provision-digital-product-step-executor.js';
import { createConsumeReservationStepExecutor } from './steps/consume-reservation-step-executor.js';
import { createNotifyCustomerStepExecutor } from './steps/notify-customer-step-executor.js';

export type DigitalFulfillmentStepRegistryDependencies = {
  readonly inventoryReservationPort: InventoryReservationPort;
  readonly reservationLifecyclePort: InventoryReservationLifecyclePort;
  readonly providerRuntimePort: ProviderRuntimePort;
  readonly notificationPort: CustomerNotificationPort;
  readonly clock: Clock;
};

export const createDigitalFulfillmentStepRegistry = (
  dependencies: DigitalFulfillmentStepRegistryDependencies,
): InMemoryPipelineStepExecutorRegistry => {
  const registry = new InMemoryPipelineStepExecutorRegistry();

  registry.register(
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.VALIDATE_ORDER,
    createValidateOrderStepExecutor(dependencies.clock),
  );
  registry.register(
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
    createReserveInventoryStepExecutor(dependencies.inventoryReservationPort, dependencies.clock),
  );
  registry.register(
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
    createProvisionDigitalProductStepExecutor(
      dependencies.providerRuntimePort,
      dependencies.reservationLifecyclePort,
      dependencies.clock,
    ),
  );
  registry.register(
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
    createConsumeReservationStepExecutor(dependencies.reservationLifecyclePort, dependencies.clock),
  );
  registry.register(
    DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER,
    createNotifyCustomerStepExecutor(dependencies.notificationPort, dependencies.clock),
  );

  return registry;
};
