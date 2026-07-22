# ADR-016: Payment Confirmation and Authorization

**Status:** Accepted  
**Date:** 2026-07-21  
**Owner:** Osama AL-Sharif

## Context

Sprint 16 proved WooCommerce inbound normalization and fulfillment through the existing gateway stack. Commerce systems emit order lifecycle events; payment systems emit payment confirmation events. These are separate concerns.

Without an explicit payment capability:

- Payment gateway field names would leak into core contracts
- WooCommerce order status alone could be treated as sufficient payment proof
- The same business order could be fulfilled twice via commerce and payment paths

Sprint 17 introduces provider-neutral payment confirmation and authorization before fulfillment executes.

## Decision

### 1. Commerce and payments are separate capabilities

WooCommerce is a commerce connector. AdfPay is a payment connector. Core understands generic `PaymentConfirmation`, `PaymentStatus`, and authorization policy — not AdfPay or WooCommerce types.

### 2. Payment model

Generic payment states in `@dap/payment`:

| Status      | Fulfillment authorized |
| ----------- | ---------------------- |
| `pending`   | No                     |
| `confirmed` | Yes                    |
| `failed`    | No                     |
| `cancelled` | No                     |
| `refunded`  | No                     |

### 3. Adapter boundary

`@dap/adfpay-connector` implements `PaymentGatewayAdapter`:

- Authenticity verification (fake boundary in Sprint 17)
- Payload parsing (`unknown` input)
- Mapping to `PaymentConfirmation`

Core and `@dap/payment` never import AdfPay types.

### 4. Authenticity verification

`AdfPaySignatureVerifier` port accepts raw body, signature, and verification secret context.

**Implemented:** deterministic fake verifiers for tests (`FakeAdfPaySignatureVerifier`).

**Deferred:** official AdfPay HMAC/signature algorithm and production secret loading. Do not claim production authenticity verification without official documentation.

### 5. Payment–order correlation

Correlation key: **`externalOrderReference`** (stable commerce order ID).

`PaymentCorrelationService` resolves the commerce order through **`CommerceOrderReadPort`**:

```
PaymentConfirmation.externalOrderReference
        ↓
CommerceOrderReadPort.findByExternalOrderReference(...)
        ↓
CommerceOrderRecord (provider-neutral)
```

Fulfillment product, quantity, and customer data come **only** from the correlated `CommerceOrderRecord`. Payment gateway payloads must not supply fulfillment context.

Forbidden correlation inputs:

- email alone (email-shaped order references are rejected)
- customer name
- amount alone
- timestamp
- metadata alone

Missing commerce order → reject, no fulfillment.

### 6. Fulfillment authorization

`PaymentAuthorizationPolicy` decides whether fulfillment may execute.

Only `PaymentStatus === confirmed` returns an authorized decision.

`PaymentConfirmationInboundAdapter` independently enforces the same invariant: only `paymentStatus === 'confirmed'` may normalize to `order.paid`. Non-confirmed statuses are rejected at the adapter boundary even if upstream authorization was bypassed.

Authorization logic lives in `@dap/payment` — not in AdfPay parser, gateway adapter internals, `PipelineRunner`, or workflow code.

### 6a. Adapter boundary validation (Sprint 17 revision)

`PaymentAuthorizedFulfillmentEvent` validation at the inbound adapter:

- `paymentReference` and `paymentSource` must be actual non-empty strings — unknown values are never coerced via `String(...)`
- `externalOrderReference` must match `commerceOrder.externalOrderReference` after trimming
- Only `confirmed` payment status is accepted for fulfillment normalization

AdfPay textual `amount_minor_units` values require strict full-string unsigned integer validation (`/^\d+$/`) before conversion. Partial strings such as `"100abc"` are rejected.

### 7. Selected WooCommerce relationship (Strategy C)

Sprint 17 keeps Sprint 16 WooCommerce behavior compatible while introducing explicit cross-path protection:

| Path                                      | Sprint 17 behavior                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| WooCommerce `order.updated` paid statuses | Still normalize to `order.paid` and may fulfill when automation matches     |
| AdfPay confirmed payment                  | May fulfill through `PaymentProcessingService`                              |
| Same `externalOrderReference`             | `OrderFulfillmentAuthorizationPort` ensures only one successful fulfillment |

WooCommerce paid status alone remains sufficient for the commerce path in Sprint 17. External payment confirmation is additionally supported without requiring WooCommerce to change. Future AdfPay gating may tighten commerce-path authorization.

### 8. Duplicate behavior

| Case                                                    | Result                                           |
| ------------------------------------------------------- | ------------------------------------------------ |
| Same payment delivery twice                             | Duplicate result; fulfillment once               |
| Same payment reference                                  | Duplicate / conflict; no second fulfillment      |
| Different confirmed payment for already-confirmed order | Conflict; no second fulfillment                  |
| Same payment reference, different order                 | Conflict; reject                                 |
| Commerce fulfilled order, then payment arrives          | `ORDER_ALREADY_FULFILLED`; no second fulfillment |

### 9. Money and currency

Amounts use integer **minor units** plus ISO 4217 currency codes via `Money`.

`PaymentAuthorizationPolicy` compares amounts only when the correlated `CommerceOrderRecord` exposes `expectedAmount`.

When expected order amount is unavailable, amount mismatch validation is **deferred** and documented — no fabricated expected amounts in tests.

### 10. Sensitive data

Never store or expose in errors, audit records, repository records, or public results:

- gateway secret
- webhook signature
- authorization token
- raw payload
- card data
- cookies

### 11. Failure semantics

Typed failures include:

- `VERIFICATION_FAILED`
- `MALFORMED_PAYLOAD`
- `CORRELATION_FAILED`
- `DUPLICATE_PAYMENT`
- `ALREADY_CONFIRMED`
- `PAYMENT_CONFLICT`
- `AUTHORIZATION_REJECTED`
- `AMOUNT_MISMATCH` / `CURRENCY_MISMATCH` (when order read data exists)
- `REPOSITORY_FAILED`
- `ORDER_ALREADY_FULFILLED`

Unexpected exceptions convert to safe typed failures without leaking stack traces or secrets.

### 12. Partial-failure behavior (Sprint 17 revision)

Sprint 17 does **not** guarantee full exactly-once semantics or transactional recovery.

Current guarantees:

- `OrderFulfillmentAuthorizationPort.tryAcquire` reduces duplicate concurrent fulfillment for the same order reference
- Successful completed orchestration marks idempotency completed for the inbound event
- Duplicate payment delivery returns deterministic duplicate results without second fulfillment

Partial-success outcomes (`partial_processing` / `partialProcessing`) occur when:

- Fulfillment orchestration succeeded but `repository.update(processedAt)` failed
- Fulfillment orchestration succeeded but `markFulfilled` failed

These outcomes do not automatically retry fulfillment and do not claim durable exactly-once behavior. Production transactionality, compensation, and durable state reconciliation remain deferred.

Release failures before fulfillment completion return typed safe failures and are not hidden.

### 13. Persistence

`InMemoryPaymentRepository` and `InMemoryOrderFulfillmentAuthorizationRegistry` only.

### 14. Deferred production work

- Official AdfPay payload mapping
- Official AdfPay signature verification
- Real webhook HTTP endpoint
- Credential loading from environment
- Production persistence
- Settlement reconciliation
- Refunds and chargebacks
- Compensation flows
- Retry workers
- Operational monitoring

## Consequences

**Positive**

- Payment concepts are reusable across future gateways (Stripe, PayPal, HyperPay, Moyasar, Tap)
- AdfPay-specific code is isolated in `@dap/adfpay-connector`
- Confirmed payments can authorize fulfillment through the real pipeline
- Cross-path double fulfillment is prevented by order-level authorization registry

**Negative / deferred**

- WooCommerce paid status remains trusted for commerce-path fulfillment in Sprint 17
- Amount validation requires future order-read integration for full mismatch protection
- Production AdfPay authenticity verification not implemented

## Related decisions

- [ADR-013](ADR-013-inbound-event-gateway.md)
- [ADR-014](ADR-014-execution-run-lifecycle.md)
- [ADR-015](ADR-015-woocommerce-inbound-adapter.md)
