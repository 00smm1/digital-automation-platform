import type { Clock } from '../../shared/time/clock.js';
import type { InventoryReservationRepository } from '../../domain/inventory/inventory-reservation-repository.js';
import { parseReservationReference } from '../../domain/inventory/inventory-references.js';
import type { ReservationReference } from '../../domain/inventory/inventory-references.js';
import { ReservationPolicy, type ReservationReferenceFactory } from './reservation-policy.js';
import type {
  ConsumeReservationCommand,
  ConsumeReservationOutcome,
  ExpireDueReservationsCommand,
  ExpireDueReservationsOutcome,
  ExpireReservationCommand,
  ExpireReservationOutcome,
  ReleaseReservationCommand,
  ReleaseReservationOutcome,
  ReserveInventoryCommand,
  ReserveInventoryOutcome,
} from './reservation-results.js';
import {
  mapReservationToOutcomeBase,
  type ReservationConsumedResult,
  type ReservationCreatedResult,
  type ReservationDuplicateResult,
  type ReservationExpiredResult,
  type ReservationReleasedResult,
} from './reservation-results.js';

export type InventoryReservationServiceDependencies = {
  readonly repository: InventoryReservationRepository;
  readonly clock: Clock;
  readonly reservationReferenceFactory: ReservationReferenceFactory;
  readonly policy?: ReservationPolicy;
};

export class InventoryReservationService {
  private readonly repository: InventoryReservationRepository;
  private readonly clock: Clock;
  private readonly policy: ReservationPolicy;
  private readonly reservationReferenceFactory: ReservationReferenceFactory;

  constructor(dependencies: InventoryReservationServiceDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
    this.policy = dependencies.policy ?? new ReservationPolicy();
    this.reservationReferenceFactory = dependencies.reservationReferenceFactory;
  }

  async reserveInventory(command: ReserveInventoryCommand): Promise<ReserveInventoryOutcome> {
    const reservationReference =
      command.reservationReference ?? this.reservationReferenceFactory.create();

    const validation = this.policy.validateReserveRequest({
      reservationReference,
      ownerReference: command.ownerReference,
      inventoryItemReference: command.inventoryItemReference,
      quantity: command.quantity,
      reservationDurationMs: command.reservationDurationMs,
      expiresAt: command.expiresAt,
      clock: this.clock,
      externalOrderReference: command.externalOrderReference,
      metadata: command.metadata,
    });

    if (!validation.ok) {
      if (validation.error.code === 'invalid-quantity') {
        return {
          kind: 'reservation-conflict',
          reasonCode: validation.error.reasonCode,
        };
      }

      return {
        kind: 'reservation-conflict',
        reasonCode: validation.error.reasonCode,
      };
    }

    try {
      const result = await this.repository.tryReserve(
        {
          reservationReference: validation.value.reservationReference,
          ownerReference: validation.value.ownerReference,
          inventoryItemReference: validation.value.inventoryItemReference,
          quantity: validation.value.quantity,
          expiresAt: validation.value.expiresAt,
          externalOrderReference: validation.value.externalOrderReference,
          metadata: validation.value.metadata,
        },
        { clock: this.clock },
      );

      switch (result.kind) {
        case 'reserved': {
          const created: ReservationCreatedResult = {
            kind: 'reservation-created',
            ...mapReservationToOutcomeBase(result.reservation),
            reservedAt: new Date(result.reservation.reservedAt.getTime()),
            expiresAt: new Date(result.reservation.expiresAt.getTime()),
          };
          return created;
        }
        case 'duplicate': {
          const duplicate: ReservationDuplicateResult = {
            kind: 'reservation-duplicate',
            ...mapReservationToOutcomeBase(result.reservation),
            reservedAt: new Date(result.reservation.reservedAt.getTime()),
            expiresAt: new Date(result.reservation.expiresAt.getTime()),
          };
          return duplicate;
        }
        case 'conflict':
          return { kind: 'reservation-conflict', reasonCode: result.reasonCode };
        case 'insufficient-inventory':
          return { kind: 'insufficient-inventory' };
        case 'inventory-item-not-found':
          return { kind: 'inventory-item-not-found' };
        case 'repository-failed':
          return { kind: 'repository-failed', reasonCode: result.reasonCode };
        default: {
          const exhaustive: never = result;
          return exhaustive;
        }
      }
    } catch {
      return { kind: 'repository-failed', reasonCode: 'try-reserve-exception' };
    }
  }

  async consumeReservation(command: ConsumeReservationCommand): Promise<ConsumeReservationOutcome> {
    const referenceResult = parseReservationReference(command.reservationReference);

    if (!referenceResult.ok) {
      return {
        kind: 'invalid-reservation-reference',
        reasonCode: referenceResult.error.reasonCode,
      };
    }

    return this.transitionConsume(referenceResult.value);
  }

  async releaseReservation(command: ReleaseReservationCommand): Promise<ReleaseReservationOutcome> {
    const referenceResult = parseReservationReference(command.reservationReference);

    if (!referenceResult.ok) {
      return {
        kind: 'invalid-reservation-reference',
        reasonCode: referenceResult.error.reasonCode,
      };
    }

    return this.transitionRelease(referenceResult.value);
  }

  async expireReservation(command: ExpireReservationCommand): Promise<ExpireReservationOutcome> {
    const referenceResult = parseReservationReference(command.reservationReference);

    if (!referenceResult.ok) {
      return {
        kind: 'invalid-reservation-reference',
        reasonCode: referenceResult.error.reasonCode,
      };
    }

    return this.transitionExpire(referenceResult.value);
  }

  async expireDueReservations(
    command: ExpireDueReservationsCommand = {},
  ): Promise<ExpireDueReservationsOutcome> {
    const nowResult = this.policy.validateExpirationInstant(command.now ?? this.clock.now());

    if (!nowResult.ok) {
      return {
        kind: 'invalid-expiration-time',
        reasonCode: nowResult.error.reasonCode,
      };
    }

    const now = nowResult.value;
    let dueReservations;

    try {
      dueReservations = await this.repository.findReservedReservationsDue({ now });
    } catch {
      return { kind: 'repository-failed', reasonCode: 'find-due-reservations-exception' };
    }

    let expiredCount = 0;
    let skippedTerminalCount = 0;
    let failedCount = 0;
    const failedReservationReferences: string[] = [];

    for (const reservation of dueReservations) {
      const outcome = await this.expireReservation({
        reservationReference: reservation.reservationReference,
      });

      if (outcome.kind === 'reservation-expired') {
        expiredCount += 1;
        continue;
      }

      if (outcome.kind === 'reservation-already-terminal') {
        if (outcome.status === 'expired') {
          expiredCount += 1;
          continue;
        }

        if (outcome.status === 'consumed' || outcome.status === 'released') {
          skippedTerminalCount += 1;
          continue;
        }

        failedCount += 1;
        failedReservationReferences.push(reservation.reservationReference);
        continue;
      }

      failedCount += 1;
      failedReservationReferences.push(reservation.reservationReference);
    }

    return {
      kind: 'expiration-summary',
      inspectedCount: dueReservations.length,
      expiredCount,
      skippedTerminalCount,
      failedCount,
      failedReservationReferences,
    };
  }

  private async transitionConsume(
    reservationReference: ReservationReference,
  ): Promise<ConsumeReservationOutcome> {
    return this.executeTransition(
      reservationReference,
      'consume',
    ) as Promise<ConsumeReservationOutcome>;
  }

  private async transitionRelease(
    reservationReference: ReservationReference,
  ): Promise<ReleaseReservationOutcome> {
    return this.executeTransition(
      reservationReference,
      'release',
    ) as Promise<ReleaseReservationOutcome>;
  }

  private async transitionExpire(
    reservationReference: ReservationReference,
  ): Promise<ExpireReservationOutcome> {
    return this.executeTransition(
      reservationReference,
      'expire',
    ) as Promise<ExpireReservationOutcome>;
  }

  private async executeTransition(
    reservationReference: ReservationReference,
    transition: 'consume' | 'release' | 'expire',
  ): Promise<ConsumeReservationOutcome | ReleaseReservationOutcome | ExpireReservationOutcome> {
    try {
      const result = await this.repository.transitionReservation({
        reservationReference,
        transition,
        context: { clock: this.clock },
      });

      switch (result.kind) {
        case 'transitioned':
        case 'idempotent':
          return this.mapTransitionOutcome(
            result.reservation,
            transition,
            result.kind === 'idempotent',
          );
        case 'invalid-transition':
          return {
            kind: 'reservation-already-terminal',
            ...mapReservationToOutcomeBase(result.reservation),
            reasonCode: result.reasonCode,
          };
        case 'reservation-not-found':
          return { kind: 'reservation-not-found' };
        case 'repository-failed':
          if (transition === 'consume') {
            return {
              kind: 'partial-processing',
              reasonCode: 'reservation-consumption-failed',
              reservationReference,
            };
          }

          if (transition === 'release') {
            return {
              kind: 'partial-processing',
              reasonCode: 'reservation-release-failed',
              reservationReference,
            };
          }

          return { kind: 'repository-failed', reasonCode: result.reasonCode };
        default: {
          const exhaustive: never = result;
          return exhaustive;
        }
      }
    } catch {
      if (transition === 'consume') {
        return {
          kind: 'partial-processing',
          reasonCode: 'reservation-consumption-failed',
          reservationReference,
        };
      }

      if (transition === 'release') {
        return {
          kind: 'partial-processing',
          reasonCode: 'reservation-release-failed',
          reservationReference,
        };
      }

      return { kind: 'repository-failed', reasonCode: 'transition-exception' };
    }
  }

  private mapTransitionOutcome(
    reservation: {
      readonly reservationReference: string;
      readonly ownerReference: string;
      readonly inventoryItemReference: string;
      readonly quantity: number;
      readonly status: 'reserved' | 'consumed' | 'released' | 'expired';
      readonly consumedAt?: Date;
      readonly releasedAt?: Date;
      readonly expiredAt?: Date;
    },
    transition: 'consume' | 'release' | 'expire',
    idempotent: boolean,
  ): ConsumeReservationOutcome | ReleaseReservationOutcome | ExpireReservationOutcome {
    const base = mapReservationToOutcomeBase(reservation);

    if (transition === 'consume') {
      if (idempotent && reservation.status === 'consumed') {
        const consumed: ReservationConsumedResult = {
          kind: 'reservation-consumed',
          ...base,
          consumedAt: new Date(reservation.consumedAt?.getTime() ?? this.clock.now().getTime()),
        };
        return consumed;
      }

      return {
        kind: 'reservation-consumed',
        ...base,
        consumedAt: new Date(reservation.consumedAt?.getTime() ?? this.clock.now().getTime()),
      };
    }

    if (transition === 'release') {
      return {
        kind: 'reservation-released',
        ...base,
        releasedAt: new Date(reservation.releasedAt?.getTime() ?? this.clock.now().getTime()),
      } satisfies ReservationReleasedResult;
    }

    return {
      kind: 'reservation-expired',
      ...base,
      expiredAt: new Date(reservation.expiredAt?.getTime() ?? this.clock.now().getTime()),
    } satisfies ReservationExpiredResult;
  }
}
