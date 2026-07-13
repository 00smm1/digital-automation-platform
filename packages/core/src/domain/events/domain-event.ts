/**
 * Contract for immutable facts that occurred inside the domain.
 */
export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly eventName: string;
}
