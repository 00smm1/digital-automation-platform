export type {
  InventoryReservationPort,
  InventoryReservationRequest,
  InventoryReservationResult,
} from './ports/inventory-reservation-port.js';
export type { DigitalProductProvisioningPort } from './ports/digital-product-provisioning-port.js';
export type { CustomerNotificationPort } from './ports/customer-notification-port.js';
export { InventoryReservationAdapter } from './adapters/inventory-reservation-adapter.js';
export { FakeDigitalProductProvisioningAdapter } from './adapters/fake-digital-product-provisioning-adapter.js';
export { InMemoryCustomerNotificationAdapter } from './adapters/in-memory-customer-notification-adapter.js';
export { FulfillmentRequestValidator } from './fulfillment-request-validator.js';
export {
  mapFulfillmentRequestToPlatformEvent,
  mapFulfillmentRequestToPipelineInput,
} from './fulfillment-event-mapper.js';
export {
  mapOrchestrationToFulfillmentResult,
  mapValidationFailureToFulfillmentResult,
} from './fulfillment-result-mapper.js';
export {
  DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES,
  DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE,
} from './fulfillment-pipeline-step-types.js';
export { DigitalFulfillmentService } from './digital-fulfillment-service.js';
export type { DigitalFulfillmentServiceDependencies } from './digital-fulfillment-service.js';
export {
  createDigitalFulfillmentStack,
  type DigitalFulfillmentStack,
  type CreateDigitalFulfillmentStackOptions,
} from './composition/create-digital-fulfillment-stack.js';
