export const FULFILLMENT_STATUSES = ['completed', 'rejected', 'failed'] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
