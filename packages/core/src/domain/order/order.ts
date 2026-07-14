import { AggregateRoot } from '../entities/aggregate-root.js';
import type { Identifier } from '../../shared/types/identifier.js';
import type { OrderItem } from './order-item.js';
import type { OrderStatus } from './order-status.js';
import { InvalidOrderTransitionError } from './errors/order-errors.js';

export type OrderId = Identifier<'Order'>;

export type OrderProps = {
  reference?: string;
  customerId: string;
  items: readonly OrderItem[];
  status: OrderStatus;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Order aggregate representing a commerce transaction independent of any sales channel.
 */
export class Order extends AggregateRoot<OrderId> {
  private _reference?: string;
  private readonly _customerId: string;
  private readonly _items: readonly OrderItem[];
  private _status: OrderStatus;
  private readonly _metadata: Readonly<Record<string, unknown>>;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: OrderId, props: OrderProps) {
    super(id);
    this._reference = props.reference;
    this._customerId = props.customerId;
    this._items = props.items;
    this._status = props.status;
    this._metadata = props.metadata;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(params: {
    id: OrderId;
    customerId: string;
    items: readonly OrderItem[];
    reference?: string;
    metadata?: Readonly<Record<string, unknown>>;
    createdAt?: Date;
  }): Order {
    const timestamp = params.createdAt ?? new Date();

    return new Order(params.id, {
      reference: params.reference,
      customerId: params.customerId,
      items: params.items,
      status: 'pending',
      metadata: params.metadata ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  static restore(id: OrderId, props: OrderProps): Order {
    return new Order(id, props);
  }

  get reference(): string | undefined {
    return this._reference;
  }

  get customerId(): string {
    return this._customerId;
  }

  get items(): readonly OrderItem[] {
    return this._items;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return this._metadata;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  markProcessing(): void {
    if (this._status !== 'pending') {
      throw new InvalidOrderTransitionError(this._id, this._status, 'processing');
    }

    this._status = 'processing';
    this._updatedAt = new Date();
  }

  markCompleted(): void {
    if (this._status !== 'processing') {
      throw new InvalidOrderTransitionError(this._id, this._status, 'completed');
    }

    this._status = 'completed';
    this._updatedAt = new Date();
  }

  markFailed(): void {
    if (this._status !== 'processing') {
      throw new InvalidOrderTransitionError(this._id, this._status, 'failed');
    }

    this._status = 'failed';
    this._updatedAt = new Date();
  }
}
