import type { Money } from './money.js';

export type CommerceOrderRecord = {
  readonly externalOrderReference: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly customerReference: string;
  readonly customerEmail?: string;
  readonly expectedAmount?: Money;
  readonly orderStatus?: string;
};

export const createCommerceOrderRecord = (params: CommerceOrderRecord): CommerceOrderRecord => ({
  externalOrderReference: params.externalOrderReference,
  productReference: params.productReference,
  quantity: params.quantity,
  customerReference: params.customerReference,
  customerEmail: params.customerEmail,
  expectedAmount: params.expectedAmount === undefined ? undefined : { ...params.expectedAmount },
  orderStatus: params.orderStatus,
});

export const copyCommerceOrderRecord = (record: CommerceOrderRecord): CommerceOrderRecord =>
  createCommerceOrderRecord(record);
