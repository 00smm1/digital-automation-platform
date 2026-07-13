import { AggregateRoot } from '../entities/aggregate-root.js';
import type { Identifier } from '../../shared/types/identifier.js';
import type { InventoryItemPayload } from './inventory-item-payload.js';
import type { InventoryItemStatus } from './inventory-item-status.js';
import type { InventoryItemType } from './inventory-item-type.js';
import {
  InvalidInventoryTransitionError,
  InventoryItemNotAvailableError,
} from './errors/inventory-errors.js';

export type InventoryItemId = Identifier<'InventoryItem'>;

export type InventoryItemProps = {
  productId: string;
  type: InventoryItemType;
  payload: InventoryItemPayload;
  status: InventoryItemStatus;
  reservedForOrderItemId?: string;
  reservedAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Digital inventory asset tracked through availability, reservation, and delivery.
 */
export class InventoryItem extends AggregateRoot<InventoryItemId> {
  private _productId: string;
  private _type: InventoryItemType;
  private _payload: InventoryItemPayload;
  private _status: InventoryItemStatus;
  private _reservedForOrderItemId?: string;
  private _reservedAt?: Date;
  private _deliveredAt?: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: InventoryItemId, props: InventoryItemProps) {
    super(id);
    this._productId = props.productId;
    this._type = props.type;
    this._payload = props.payload;
    this._status = props.status;
    this._reservedForOrderItemId = props.reservedForOrderItemId;
    this._reservedAt = props.reservedAt;
    this._deliveredAt = props.deliveredAt;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(params: {
    id: InventoryItemId;
    productId: string;
    type: InventoryItemType;
    payload: InventoryItemPayload;
    createdAt?: Date;
  }): InventoryItem {
    const timestamp = params.createdAt ?? new Date();

    return new InventoryItem(params.id, {
      productId: params.productId,
      type: params.type,
      payload: params.payload,
      status: 'available',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  static restore(id: InventoryItemId, props: InventoryItemProps): InventoryItem {
    return new InventoryItem(id, props);
  }

  get productId(): string {
    return this._productId;
  }

  get type(): InventoryItemType {
    return this._type;
  }

  get payload(): InventoryItemPayload {
    return this._payload;
  }

  get status(): InventoryItemStatus {
    return this._status;
  }

  get reservedForOrderItemId(): string | undefined {
    return this._reservedForOrderItemId;
  }

  get reservedAt(): Date | undefined {
    return this._reservedAt;
  }

  get deliveredAt(): Date | undefined {
    return this._deliveredAt;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  toProps(): InventoryItemProps {
    return {
      productId: this._productId,
      type: this._type,
      payload: this._payload,
      status: this._status,
      reservedForOrderItemId: this._reservedForOrderItemId,
      reservedAt: this._reservedAt,
      deliveredAt: this._deliveredAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  reserve(orderItemId: string, reservedAt: Date = new Date()): void {
    if (this._status === 'disabled') {
      throw new InventoryItemNotAvailableError(this.id, this._status);
    }

    if (this._status !== 'available') {
      throw new InvalidInventoryTransitionError(this._status, 'reserved');
    }

    this._status = 'reserved';
    this._reservedForOrderItemId = orderItemId;
    this._reservedAt = reservedAt;
    this._updatedAt = reservedAt;
  }

  releaseReservation(releasedAt: Date = new Date()): void {
    if (this._status === 'delivered') {
      throw new InvalidInventoryTransitionError(this._status, 'available');
    }

    if (this._status !== 'reserved') {
      throw new InvalidInventoryTransitionError(this._status, 'available');
    }

    this._status = 'available';
    this._reservedForOrderItemId = undefined;
    this._reservedAt = undefined;
    this._updatedAt = releasedAt;
  }

  markDelivered(deliveredAt: Date = new Date()): void {
    if (this._status !== 'reserved') {
      throw new InvalidInventoryTransitionError(this._status, 'delivered');
    }

    this._status = 'delivered';
    this._deliveredAt = deliveredAt;
    this._updatedAt = deliveredAt;
  }

  disable(disabledAt: Date = new Date()): void {
    if (this._status === 'delivered') {
      throw new InvalidInventoryTransitionError(this._status, 'disabled');
    }

    this._status = 'disabled';
    this._reservedForOrderItemId = undefined;
    this._reservedAt = undefined;
    this._updatedAt = disabledAt;
  }
}
