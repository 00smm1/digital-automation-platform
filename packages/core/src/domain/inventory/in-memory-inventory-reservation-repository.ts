import {
  applyConsumptionToInventory,
  applyExpirationToInventory,
  applyReleaseToInventory,
  applyReservationToInventory,
  cloneQuantityInventoryRecord,
  type QuantityInventoryRecord,
} from './quantity-inventory-record.js';
import {
  buildReservationDuplicateKey,
  type InventoryItemReference,
  type ReservationOwnerReference,
  type ReservationReference,
} from './inventory-references.js';
import {
  cloneInventoryReservation,
  createInventoryReservation,
  type InventoryReservation,
} from './inventory-reservation.js';
import {
  consumeReservationTransition,
  expireReservationTransition,
  releaseReservationTransition,
} from './reservation-transitions.js';
import type {
  InventoryReservationRepository,
  InventoryReservationRepositoryContext,
  ReservationRequestRecord,
  ReservationTransitionKind,
  TransitionReservationResult,
  TryReserveResult,
} from './inventory-reservation-repository.js';
import { isTerminalReservationStatus } from './reservation-status.js';

/**
 * In-memory repository with per-item promise serialization for atomic reservation behavior.
 */
export class InMemoryInventoryReservationRepository implements InventoryReservationRepository {
  private readonly inventoryItems = new Map<InventoryItemReference, QuantityInventoryRecord>();
  private readonly reservations = new Map<ReservationReference, InventoryReservation>();
  private readonly reservationsByOwnerKey = new Map<string, InventoryReservation>();
  private readonly itemLocks = new Map<InventoryItemReference, Promise<void>>();

  async saveInventoryItem(item: QuantityInventoryRecord): Promise<void> {
    this.inventoryItems.set(item.inventoryItemReference, cloneQuantityInventoryRecord(item));
  }

  async findInventoryItemByReference(
    inventoryItemReference: InventoryItemReference,
  ): Promise<QuantityInventoryRecord | null> {
    const item = this.inventoryItems.get(inventoryItemReference);
    return item === undefined ? null : cloneQuantityInventoryRecord(item);
  }

  async findReservationByReference(
    reservationReference: ReservationReference,
  ): Promise<InventoryReservation | null> {
    const reservation = this.reservations.get(reservationReference);
    return reservation === undefined ? null : cloneInventoryReservation(reservation);
  }

  async findReservationByOwnerKey(params: {
    readonly ownerReference: ReservationOwnerReference;
    readonly inventoryItemReference: InventoryItemReference;
  }): Promise<InventoryReservation | null> {
    const key = buildReservationDuplicateKey(params);
    const reservation = this.reservationsByOwnerKey.get(key);
    return reservation === undefined ? null : cloneInventoryReservation(reservation);
  }

  async tryReserve(
    request: ReservationRequestRecord,
    context: InventoryReservationRepositoryContext,
  ): Promise<TryReserveResult> {
    return this.withItemLock(request.inventoryItemReference, async () => {
      try {
        const existingByReference = await this.findReservationByReference(
          request.reservationReference,
        );

        if (existingByReference !== null) {
          const sameOwner = existingByReference.ownerReference === request.ownerReference;
          const sameItem =
            existingByReference.inventoryItemReference === request.inventoryItemReference;

          if (!sameOwner || !sameItem) {
            return { kind: 'conflict', reasonCode: 'reservation-reference-conflict' };
          }

          if (
            existingByReference.quantity === request.quantity &&
            existingByReference.status === 'reserved'
          ) {
            return { kind: 'duplicate', reservation: existingByReference };
          }

          return { kind: 'conflict', reasonCode: 'reservation-reference-quantity-conflict' };
        }

        const ownerKey = buildReservationDuplicateKey({
          ownerReference: request.ownerReference,
          inventoryItemReference: request.inventoryItemReference,
        });
        const existingByOwner = this.reservationsByOwnerKey.get(ownerKey);

        if (existingByOwner !== undefined) {
          if (
            existingByOwner.quantity === request.quantity &&
            existingByOwner.status === 'reserved'
          ) {
            return { kind: 'duplicate', reservation: cloneInventoryReservation(existingByOwner) };
          }

          if (isTerminalReservationStatus(existingByOwner.status)) {
            return { kind: 'conflict', reasonCode: 'owner-requirement-already-completed' };
          }

          return { kind: 'conflict', reasonCode: 'owner-quantity-conflict' };
        }

        const inventoryItem = await this.findInventoryItemByReference(
          request.inventoryItemReference,
        );

        if (inventoryItem === null) {
          return { kind: 'inventory-item-not-found' };
        }

        const reservedInventoryResult = applyReservationToInventory(
          inventoryItem,
          request.quantity,
        );

        if (!reservedInventoryResult.ok) {
          return { kind: 'insufficient-inventory' };
        }

        const now = context.clock.now();
        const reservation = createInventoryReservation({
          reservationReference: request.reservationReference,
          ownerReference: request.ownerReference,
          inventoryItemReference: request.inventoryItemReference,
          quantity: request.quantity,
          status: 'reserved',
          reservedAt: now,
          expiresAt: new Date(request.expiresAt.getTime()),
          externalOrderReference: request.externalOrderReference,
          version: 0,
          metadata: request.metadata,
        });

        await this.saveInventoryItem(reservedInventoryResult.value);
        this.persistReservation(reservation, ownerKey);

        return {
          kind: 'reserved',
          reservation,
          inventoryItem: reservedInventoryResult.value,
        };
      } catch {
        return { kind: 'repository-failed', reasonCode: 'try-reserve-unexpected-failure' };
      }
    });
  }

  async transitionReservation(params: {
    readonly reservationReference: ReservationReference;
    readonly transition: ReservationTransitionKind;
    readonly context: InventoryReservationRepositoryContext;
  }): Promise<TransitionReservationResult> {
    const reservation = await this.findReservationByReference(params.reservationReference);

    if (reservation === null) {
      return { kind: 'reservation-not-found' };
    }

    return this.withItemLock(reservation.inventoryItemReference, async () => {
      try {
        const current = await this.findReservationByReference(params.reservationReference);

        if (current === null) {
          return { kind: 'reservation-not-found' };
        }

        const now = params.context.clock.now();
        const transitionResult = this.applyTransition(current, params.transition, now);

        if (!transitionResult.ok) {
          return {
            kind: 'invalid-transition',
            reasonCode: transitionResult.error.reasonCode,
            reservation: cloneInventoryReservation(current),
          };
        }

        const nextReservation = transitionResult.value;
        const inventoryItem = await this.findInventoryItemByReference(
          current.inventoryItemReference,
        );

        if (inventoryItem === null) {
          return {
            kind: 'repository-failed',
            reasonCode: 'inventory-item-missing-during-transition',
          };
        }

        const inventoryUpdateResult = this.applyInventoryTransition(
          inventoryItem,
          current,
          nextReservation,
          params.transition,
        );

        if (!inventoryUpdateResult.ok) {
          return { kind: 'repository-failed', reasonCode: 'inventory-update-failed' };
        }

        const ownerKey = buildReservationDuplicateKey({
          ownerReference: current.ownerReference,
          inventoryItemReference: current.inventoryItemReference,
        });

        await this.saveInventoryItem(inventoryUpdateResult.value);
        this.persistReservation(nextReservation, ownerKey);

        const idempotent =
          current.status === nextReservation.status && current.version === nextReservation.version;

        return {
          kind: idempotent ? 'idempotent' : 'transitioned',
          reservation: nextReservation,
          inventoryItem: inventoryUpdateResult.value,
        };
      } catch {
        return { kind: 'repository-failed', reasonCode: 'transition-unexpected-failure' };
      }
    });
  }

  async findReservedReservationsDue(params: {
    readonly now: Date;
  }): Promise<readonly InventoryReservation[]> {
    return [...this.reservations.values()]
      .filter(
        (reservation) =>
          reservation.status === 'reserved' &&
          reservation.expiresAt.getTime() <= params.now.getTime(),
      )
      .map((reservation) => cloneInventoryReservation(reservation));
  }

  /** Test-only inspection helpers. */
  inspectInventoryItem(
    inventoryItemReference: InventoryItemReference,
  ): QuantityInventoryRecord | undefined {
    const item = this.inventoryItems.get(inventoryItemReference);
    return item === undefined ? undefined : cloneQuantityInventoryRecord(item);
  }

  inspectReservation(reservationReference: ReservationReference): InventoryReservation | undefined {
    const reservation = this.reservations.get(reservationReference);
    return reservation === undefined ? undefined : cloneInventoryReservation(reservation);
  }

  inspectAllReservations(): readonly InventoryReservation[] {
    return [...this.reservations.values()].map((reservation) =>
      cloneInventoryReservation(reservation),
    );
  }

  private persistReservation(reservation: InventoryReservation, ownerKey: string): void {
    this.reservations.set(reservation.reservationReference, cloneInventoryReservation(reservation));
    this.reservationsByOwnerKey.set(ownerKey, cloneInventoryReservation(reservation));
  }

  private applyTransition(
    reservation: InventoryReservation,
    transition: ReservationTransitionKind,
    now: Date,
  ) {
    switch (transition) {
      case 'consume':
        return consumeReservationTransition(reservation, now);
      case 'release':
        return releaseReservationTransition(reservation, now);
      case 'expire':
        return expireReservationTransition(reservation, now);
      default: {
        const exhaustive: never = transition;
        return exhaustive;
      }
    }
  }

  private applyInventoryTransition(
    inventoryItem: QuantityInventoryRecord,
    previousReservation: InventoryReservation,
    nextReservation: InventoryReservation,
    transition: ReservationTransitionKind,
  ) {
    if (previousReservation.status === nextReservation.status) {
      return { ok: true as const, value: inventoryItem };
    }

    switch (transition) {
      case 'consume':
        return applyConsumptionToInventory(inventoryItem, previousReservation.quantity);
      case 'release':
        return applyReleaseToInventory(inventoryItem, previousReservation.quantity);
      case 'expire':
        return applyExpirationToInventory(inventoryItem, previousReservation.quantity);
      default: {
        const exhaustive: never = transition;
        return exhaustive;
      }
    }
  }

  private async withItemLock<T>(
    inventoryItemReference: InventoryItemReference,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previousLock = this.itemLocks.get(inventoryItemReference) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.itemLocks.set(
      inventoryItemReference,
      previousLock.then(() => currentLock),
    );

    await previousLock;

    try {
      return await operation();
    } finally {
      releaseLock();
    }
  }
}

export type FailingInventoryReservationRepository = InventoryReservationRepository & {
  readonly failNextTryReserve: () => void;
  readonly failNextConsume: () => void;
  readonly failNextRelease: () => void;
  readonly failNextExpire: () => void;
  readonly failNextFindDue: () => void;
};

export const createFailingInventoryReservationRepository = (
  delegate: InMemoryInventoryReservationRepository,
): FailingInventoryReservationRepository => {
  let failTryReserve = false;
  let failConsume = false;
  let failRelease = false;
  let failExpire = false;
  let failFindDue = false;

  const repository: FailingInventoryReservationRepository = {
    saveInventoryItem: (item) => delegate.saveInventoryItem(item),
    findInventoryItemByReference: (ref) => delegate.findInventoryItemByReference(ref),
    findReservationByReference: (ref) => delegate.findReservationByReference(ref),
    findReservationByOwnerKey: (params) => delegate.findReservationByOwnerKey(params),
    findReservedReservationsDue: async (params) => {
      if (failFindDue) {
        failFindDue = false;
        throw new Error('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
      }

      return delegate.findReservedReservationsDue(params);
    },
    failNextTryReserve: () => {
      failTryReserve = true;
    },
    failNextConsume: () => {
      failConsume = true;
    },
    failNextRelease: () => {
      failRelease = true;
    },
    failNextExpire: () => {
      failExpire = true;
    },
    failNextFindDue: () => {
      failFindDue = true;
    },
    async tryReserve(request, context) {
      if (failTryReserve) {
        failTryReserve = false;
        throw new Error('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
      }

      return delegate.tryReserve(request, context);
    },
    async transitionReservation(params) {
      if (params.transition === 'consume' && failConsume) {
        failConsume = false;
        throw new Error('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
      }

      if (params.transition === 'release' && failRelease) {
        failRelease = false;
        throw new Error('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
      }

      if (params.transition === 'expire' && failExpire) {
        failExpire = false;
        throw new Error('SENTINEL_REPOSITORY_SECRET_DO_NOT_LEAK');
      }

      return delegate.transitionReservation(params);
    },
  };

  return repository;
};
