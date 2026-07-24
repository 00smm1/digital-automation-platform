import type { InventoryReservationService } from '../../inventory/inventory-reservation-service.js';
import type {
  InventoryReservationLifecyclePort,
  InventoryReservationPort,
  InventoryReservationRequest,
} from '../ports/inventory-reservation-port.js';

export class QuantityInventoryReservationAdapter
  implements InventoryReservationPort, InventoryReservationLifecyclePort
{
  private readonly reservationService: InventoryReservationService;

  constructor(reservationService: InventoryReservationService) {
    this.reservationService = reservationService;
  }

  async reserve(request: InventoryReservationRequest) {
    const outcome = await this.reservationService.reserveInventory({
      ownerReference: request.ownerReference,
      inventoryItemReference: request.inventoryItemReference,
      quantity: request.quantity,
      externalOrderReference: request.externalOrderReference,
      reservationDurationMs: request.reservationDurationMs,
    });

    switch (outcome.kind) {
      case 'reservation-created':
      case 'reservation-duplicate':
        return outcome;
      case 'reservation-conflict':
        if (
          outcome.reasonCode === 'invalid-type' ||
          outcome.reasonCode === 'nan' ||
          outcome.reasonCode === 'non-finite' ||
          outcome.reasonCode === 'non-integer' ||
          outcome.reasonCode === 'unsafe-integer' ||
          outcome.reasonCode === 'non-positive' ||
          outcome.reasonCode === 'negative'
        ) {
          return { kind: 'invalid-quantity' as const, reasonCode: outcome.reasonCode };
        }

        return outcome;
      case 'insufficient-inventory':
      case 'inventory-item-not-found':
      case 'repository-failed':
        return outcome;
      default: {
        const exhaustive: never = outcome;
        return exhaustive;
      }
    }
  }

  async consumeReservation(reservationReference: string) {
    return this.reservationService.consumeReservation({ reservationReference });
  }

  async releaseReservation(reservationReference: string) {
    return this.reservationService.releaseReservation({ reservationReference });
  }
}
