import { createIdentifier, type Identifier } from '../../shared/types/identifier.js';
import { Result } from '../../shared/types/result.js';
import type { ExecutionRunId } from '../execution-run/execution-run-id.js';

export type InventoryItemReference = Identifier<'InventoryItemReference'>;

export type ReservationReference = Identifier<'ReservationReference'>;

export type ReservationOwnerReference = ExecutionRunId;

export type ReservationReferenceValidationError = {
  readonly reasonCode:
    | 'non-string-reference'
    | 'empty-reference'
    | 'whitespace-only-reference'
    | 'malformed-reference';
};

export const createInventoryItemReference = (value: string): InventoryItemReference =>
  createIdentifier('InventoryItemReference', value);

export const createReservationReference = (value: string): ReservationReference =>
  createIdentifier('ReservationReference', value);

export const parseReservationReference = (
  value: unknown,
): Result<ReservationReference, ReservationReferenceValidationError> => {
  if (typeof value !== 'string') {
    return Result.fail({ reasonCode: 'non-string-reference' });
  }

  if (value.trim().length === 0) {
    return Result.fail({
      reasonCode: value.length === 0 ? 'empty-reference' : 'whitespace-only-reference',
    });
  }

  if (value !== value.trim()) {
    return Result.fail({ reasonCode: 'malformed-reference' });
  }

  return Result.ok(createReservationReference(value));
};

export const createReservationOwnerReference = (
  executionRunId: ExecutionRunId,
): ReservationOwnerReference => executionRunId;

export const buildReservationDuplicateKey = (params: {
  readonly ownerReference: ReservationOwnerReference;
  readonly inventoryItemReference: InventoryItemReference;
}): string => `${params.ownerReference}:${params.inventoryItemReference}`;
