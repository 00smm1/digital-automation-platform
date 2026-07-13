import type { Entity } from '../entities/entity.js';
import type { Identifier } from '../../shared/types/identifier.js';

/**
 * Persistence contract for aggregate roots and entities.
 */
export interface IRepository<TEntity extends Entity<TId>, TId extends Identifier = Identifier> {
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<void>;
  delete(id: TId): Promise<void>;
}
