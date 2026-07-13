import type { Identifier } from '../../shared/types/identifier.js';
import type { DomainEvent } from '../events/domain-event.js';
import { Entity } from './entity.js';

/**
 * Aggregate root that can emit domain events during state transitions.
 */
export abstract class AggregateRoot<TId extends Identifier = Identifier> extends Entity<TId> {
  private readonly _domainEvents: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }
}
