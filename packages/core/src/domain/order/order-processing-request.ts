import type { AutomationPipeline } from '../automation/automation-pipeline.js';
import type { Order } from './order.js';

export type OrderCustomerContext = {
  readonly id: string;
  readonly email?: string;
};

export type OrderPaymentContext = {
  readonly id: string;
  readonly status: string;
  readonly amount?: number;
  readonly currency?: string;
};

/**
 * Request to process an order through validation, planning, and fulfillment.
 */
export type OrderProcessingRequest = {
  readonly runId: string;
  readonly order: Order;
  readonly customer: OrderCustomerContext;
  readonly payment?: OrderPaymentContext;
  readonly pipelines: Readonly<Record<string, AutomationPipeline>>;
  readonly defaultPipelineId?: string;
};

export const createOrderProcessingRequest = (
  params: OrderProcessingRequest,
): OrderProcessingRequest => params;
