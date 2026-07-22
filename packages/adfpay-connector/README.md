# @dap/adfpay-connector

AdfPay payment gateway adapter translating trusted AdfPay-shaped events into provider-neutral payment confirmations.

## Purpose

Translate AdfPay webhook payloads into `@dap/payment` confirmations at the connector boundary.

## Allowed dependencies

- `@dap/payment`
- `@dap/core`

## Forbidden responsibilities

- Payment authorization policy
- Fulfillment orchestration
- Order business rules
- Database persistence
- Production HTTP hosting

Production AdfPay signature verification and official field mapping are deferred.

Test fixtures live under `src/fixtures/` and are imported directly in tests — they are not exported from the package public API.

See [ADR-016](../../docs/decisions/ADR-016-payment-confirmation-and-authorization.md).
