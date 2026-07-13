import type { EventBus } from '../events/event-bus.js';
import type { InventoryRepository } from '../../domain/inventory/inventory-repository.js';

export type InventoryServiceDependencies = {
  readonly repository: InventoryRepository;
  readonly eventBus: EventBus;
};
