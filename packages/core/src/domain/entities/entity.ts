import type { Identifier } from '../../shared/types/identifier.js';

/**
 * Base class for domain entities identified by a stable ID.
 * Equality is defined by identifier, not by attribute comparison.
 */
export abstract class Entity<TId extends Identifier = Identifier> {
  protected readonly _id: TId;

  protected constructor(id: TId) {
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this.constructor !== other.constructor) {
      return false;
    }

    return this._id === other._id;
  }
}
