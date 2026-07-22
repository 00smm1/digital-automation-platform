# @dap/payment

Provider-neutral payment confirmation, correlation, authorization, and fulfillment gating for the Digital Automation Platform.

## Purpose

Own provider-neutral payment concepts and application policies used before workflow fulfillment executes.

## Allowed dependencies

- `@dap/core` — shared Result types, inbound gateway, fulfillment, and order authorization port contracts

## Forbidden dependencies

- `@dap/adfpay-connector`
- `@dap/woocommerce-connector`
- `apps/*`
- HTTP frameworks
- database implementations
- provider SDKs

## Public API

See `src/index.ts` exports: payment domain models, repository port, authorization policy, correlation service, processing service, and composition root.

## Forbidden responsibilities

- Parsing gateway-specific payloads
- Loading production secrets
- Handling HTTP
- Implementing provider-specific signatures
- Provider-specific status mapping

## Correlation and fulfillment data

Payment gateway events confirm payment only. Fulfillment product, quantity, and customer context come from `CommerceOrderReadPort` via correlated `CommerceOrderRecord` — never from payment payloads.

## Partial-failure behavior

When fulfillment succeeds but durable payment or order-authorization state cannot be recorded, processing returns `partial_processing`. Full exactly-once semantics and production transactionality remain deferred.

See [ADR-016](../../docs/decisions/ADR-016-payment-confirmation-and-authorization.md).
