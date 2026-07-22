import type { CommerceOrderRecord } from '../domain/commerce-order-record.js';
import { copyCommerceOrderRecord } from '../domain/commerce-order-record.js';

export type CommerceOrderReadPort = {
  findByExternalOrderReference(externalOrderReference: string): Promise<CommerceOrderRecord | null>;
};

export class InMemoryCommerceOrderReadPort implements CommerceOrderReadPort {
  private readonly orders = new Map<string, CommerceOrderRecord>();

  save(order: CommerceOrderRecord): void {
    this.orders.set(order.externalOrderReference, copyCommerceOrderRecord(order));
  }

  async findByExternalOrderReference(
    externalOrderReference: string,
  ): Promise<CommerceOrderRecord | null> {
    const order = this.orders.get(externalOrderReference);
    return order === undefined ? null : copyCommerceOrderRecord(order);
  }

  getAllOrders(): readonly CommerceOrderRecord[] {
    return [...this.orders.values()].map((order) => copyCommerceOrderRecord(order));
  }
}
