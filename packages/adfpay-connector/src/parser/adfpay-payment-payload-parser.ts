import { createMoney, type Money } from '@dap/payment';
import { AdfPayAdapterError } from '../errors/adfpay-adapter-errors.js';
import { ADFPAY_STATUS_TO_PAYMENT_STATUS } from '../constants/adfpay-event-type.js';

export type ParsedAdfPayPaymentPayload = {
  readonly paymentReference: string;
  readonly externalOrderReference: string;
  readonly status: keyof typeof ADFPAY_STATUS_TO_PAYMENT_STATUS;
  readonly occurredAt: Date;
  readonly money?: Money;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

const parseNonNegativeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
      return undefined;
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0 || !UNSIGNED_INTEGER_PATTERN.test(trimmed)) {
      return undefined;
    }

    const parsed = Number.parseInt(trimmed, 10);

    if (!Number.isSafeInteger(parsed)) {
      return undefined;
    }

    return parsed;
  }

  return undefined;
};

export const parseAdfPayPaymentPayload = (payload: unknown): ParsedAdfPayPaymentPayload => {
  if (!isRecord(payload)) {
    throw new AdfPayAdapterError('AdfPay payment payload is malformed.', 'MALFORMED_PAYLOAD');
  }

  const paymentReference =
    typeof payload.payment_id === 'string' && payload.payment_id.trim().length > 0
      ? payload.payment_id.trim()
      : undefined;

  if (paymentReference === undefined) {
    throw new AdfPayAdapterError(
      'AdfPay payment payload is missing payment reference.',
      'MISSING_PAYMENT_REFERENCE',
    );
  }

  const externalOrderReference =
    typeof payload.order_id === 'string' && payload.order_id.trim().length > 0
      ? payload.order_id.trim()
      : typeof payload.order_id === 'number' &&
          Number.isInteger(payload.order_id) &&
          payload.order_id > 0
        ? String(payload.order_id)
        : undefined;

  if (externalOrderReference === undefined) {
    throw new AdfPayAdapterError(
      'AdfPay payment payload is missing order reference.',
      'MISSING_ORDER_REFERENCE',
    );
  }

  const statusValue = payload.status;

  if (typeof statusValue !== 'string' || !(statusValue in ADFPAY_STATUS_TO_PAYMENT_STATUS)) {
    throw new AdfPayAdapterError(
      `Unsupported AdfPay payment status "${String(statusValue)}".`,
      'UNSUPPORTED_STATUS',
    );
  }

  const occurredAtValue = payload.occurred_at;

  if (typeof occurredAtValue !== 'string' || occurredAtValue.trim().length === 0) {
    throw new AdfPayAdapterError(
      'AdfPay payment payload is missing occurred_at.',
      'INVALID_TIMESTAMP',
    );
  }

  const occurredAt = new Date(occurredAtValue);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new AdfPayAdapterError(
      'AdfPay payment payload has an invalid timestamp.',
      'INVALID_TIMESTAMP',
    );
  }

  let money: Money | undefined;

  if (payload.amount_minor_units !== undefined || payload.currency !== undefined) {
    const amountMinorUnits = parseNonNegativeInteger(payload.amount_minor_units);
    const currency = typeof payload.currency === 'string' ? payload.currency : '';

    if (amountMinorUnits === undefined) {
      throw new AdfPayAdapterError(
        'AdfPay payment payload has an invalid amount.',
        'INVALID_AMOUNT',
      );
    }

    money = createMoney({ amountMinorUnits, currency });

    if (money === undefined) {
      throw new AdfPayAdapterError(
        'AdfPay payment payload has an invalid currency.',
        'INVALID_CURRENCY',
      );
    }
  }

  return {
    paymentReference,
    externalOrderReference,
    status: statusValue as keyof typeof ADFPAY_STATUS_TO_PAYMENT_STATUS,
    occurredAt,
    money,
  };
};

export const safeParseAdfPayPaymentPayload = (
  payload: unknown,
): ParsedAdfPayPaymentPayload | AdfPayAdapterError => {
  try {
    return parseAdfPayPaymentPayload(payload);
  } catch (error: unknown) {
    if (error instanceof AdfPayAdapterError) {
      return error;
    }

    return new AdfPayAdapterError('AdfPay payment payload is malformed.', 'MALFORMED_PAYLOAD');
  }
};
