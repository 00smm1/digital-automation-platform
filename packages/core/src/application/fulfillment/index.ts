export type {
  InventoryReservationPort,
  InventoryReservationLifecyclePort,
  InventoryReservationRequest,
  InventoryReservationStepOutput,
  InventoryReservationFailure,
} from './ports/inventory-reservation-port.js';
export type { CustomerNotificationPort } from './ports/customer-notification-port.js';
export { QuantityInventoryReservationAdapter } from './adapters/quantity-inventory-reservation-adapter.js';
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
