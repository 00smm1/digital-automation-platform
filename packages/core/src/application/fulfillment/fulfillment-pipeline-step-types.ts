export const DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES = {
  VALIDATE_ORDER: 'validate-order',
  RESERVE_INVENTORY: 'reserve-inventory',
  PROVISION_DIGITAL_PRODUCT: 'provision-digital-product',
  NOTIFY_CUSTOMER: 'notify-customer',
} as const;

export type DigitalFulfillmentPipelineStepType =
  (typeof DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES)[keyof typeof DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES];

export const DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE = 'digital-product-fulfillment';
