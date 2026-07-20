# ADR-015: WooCommerce Inbound Adapter

**Status:** Accepted  
**Date:** 2026-07-21  
**Owner:** Osama AL-Sharif

## Context

Sprints 14–15 established a provider-neutral inbound gateway, idempotency contracts, and execution-run lifecycle integrated with digital fulfillment. External commerce systems still deliver vendor-specific webhook payloads. WooCommerce is the first real storefront for the Lord TV reference scenario.

Without an explicit adapter boundary:

- WooCommerce field names would leak into `@dap/core` contracts
- Unverified webhook payloads could trigger fulfillment
- Multi-product orders could be silently flattened into incorrect product references
- Duplicate webhook delivery semantics would remain undocumented for commerce events

Sprint 16 introduces the first real commerce-platform inbound adapter as a separate integration package.

## Decision

### 1. Why WooCommerce is the first real inbound adapter

WooCommerce is the current Lord TV storefront (ADR-005). It provides order lifecycle webhooks with HMAC signatures and is already modeled as a thin WordPress connector (ADR-001, ADR-002). Implementing WooCommerce first validates the inbound gateway stack before HTTP ingress or additional connectors.

### 2. Adapter boundary

Add `@dap/woocommerce-connector` as a storefront integration package:

```text
WooCommerce Webhook
    ↓
WooCommerceEnvelopeFactory (signature + topic gate)
    ↓
ExternalEventEnvelope
    ↓
WooCommerceInboundEventAdapter
    ↓
Normalized Platform Event
    ↓
InboundEventGateway → Idempotency → Execution Run → Orchestrator → Pipeline → Fulfillment
```

WooCommerce-specific types, parsers, and signature verification stay in the connector package. `@dap/core` contracts remain provider-neutral.

### 3. Supported webhook topic

| WooCommerce topic | Platform envelope `eventType` | Normalized `eventType` |
| ----------------- | ----------------------------- | ---------------------- |
| `order.updated`   | `order.updated`               | `order.paid`           |

All other topics return `UNSUPPORTED_TOPIC` before normalization.

Rationale: WooCommerce emits `order.updated` when order status changes, including transitions into paid/fulfillable states. The platform automation trigger remains `order.paid`.

### 4. Accepted paid order statuses

Only orders whose WooCommerce status represents confirmed or completed payment are normalized:

| Accepted status | Meaning                                      |
| --------------- | -------------------------------------------- |
| `processing`    | Payment received; order awaiting fulfillment |
| `completed`     | Payment received and order completed         |

Rejected without fulfillment (typed `UNSUPPORTED_ORDER_STATUS`, no idempotency claim):

| Rejected status | Reason                                |
| --------------- | ------------------------------------- |
| `pending`       | Unpaid                                |
| `on-hold`       | Awaiting review or payment            |
| `failed`        | Payment failed                        |
| `cancelled`     | Order cancelled                       |
| `refunded`      | Refund issued — compensation deferred |
| `trash`         | Deleted order                         |

Do not provision based solely on receiving any order webhook.

### 5. Event identity policy

```text
externalEventId = deliveryId                         when deliveryId is present
externalEventId = order.updated:{orderId}:{dateModified}:{status}   otherwise
```

| Field used          | Included in identity?     |
| ------------------- | ------------------------- |
| Webhook delivery ID | Preferred when supplied   |
| WooCommerce topic   | Yes (fallback derivation) |
| Order ID            | Yes (fallback derivation) |
| Order modified time | Yes (fallback derivation) |
| Order status        | Yes (fallback derivation) |
| `receivedAt`        | No                        |
| Payload content     | No                        |
| Billing email       | No                        |
| Payment card data   | No                        |

**Collision and replay implications:**

- Same delivery ID redelivered → gateway duplicate result; fulfillment executes once
- Same order with new modified timestamp or status → new external event ID → separate processing (intentional for status transitions such as `processing` → `completed`)
- Future orchestration-level `(eventId, automationId)` deduplication (ADR-010) may further constrain duplicate automation execution

Idempotency key remains `${sourceId}:${externalEventId}` per ADR-013.

### 6. Signature verification policy

Introduce `WooCommerceSignatureVerifier` port accepting only:

- raw request body (string)
- supplied WooCommerce signature
- configured secret (verification context only — never stored or logged)

**Implemented:** `WooCommerceHmacSignatureVerifier` using WooCommerce-compatible `HMAC-SHA256` over the raw body with base64 digest and constant-time comparison via Node.js `crypto.timingSafeEqual`.

**Deferred:** Secret loading from environment, HTTP header extraction, and production webhook endpoint wiring.

Invalid signature → `INVALID_SIGNATURE` at envelope factory; no normalization, idempotency claim, execution run, or orchestration.

### 7. Product and variation mapping

Product reference policy for fulfillment:

```text
product.reference = String(variation_id)   when variation_id is present and > 0
product.reference = String(product_id)     otherwise
```

Invalid or zero product ID → `INVALID_PRODUCT_REFERENCE`.

### 8. Multi-line-item policy

**Policy B (Sprint 16):** Reject orders with more than one fulfillable line item.

`InboundEventAdapter` returns a single normalized event. Fan-out to one event per line item is deferred until gateway/adapter composition explicitly supports adapter fan-out.

Failure code: `MULTIPLE_LINE_ITEMS`.

Do not flatten multiple products into one incorrect product reference.

### 9. Customer-reference mapping

| Condition                       | `customer.id` value            |
| ------------------------------- | ------------------------------ |
| `customer_id` present and > 0   | String WooCommerce customer ID |
| Guest order (`customer_id` = 0) | Normalized billing email       |

Billing addresses, phone numbers, and other PII beyond email are not mapped into normalized payload or audit metadata.

Missing both customer ID and billing email → `MISSING_CUSTOMER_REFERENCE`.

### 10. Sensitive-data policy

Never expose or persist in errors, audit records, metadata, or logs:

- webhook secret
- signature value
- raw request body
- authorization headers
- payment card information
- full billing address

Envelope factory metadata includes only sanitized fields: topic, order ID, order status.

### 11. Failure behavior summary

| Failure                    | Normalization | Idempotency | Execution run | Fulfillment |
| -------------------------- | ------------- | ----------- | ------------- | ----------- |
| Invalid signature          | No            | No          | No            | No          |
| Malformed payload          | No            | No          | No            | No          |
| Unsupported topic          | No            | No          | No            | No          |
| Unsupported order status   | No            | No          | No            | No          |
| Multiple line items        | No            | No          | No            | No          |
| Invalid product / quantity | No            | No          | No            | No          |
| Accepted paid order        | Yes           | Yes         | Yes           | Yes         |

Unexpected parser or verifier exceptions convert to safe typed failures without leaking exception text.

### 12. AdfPay interaction (future)

WooCommerce order status alone is insufficient when AdfPay confirmation is required. Future sprints may require:

- AdfPay webhook or polling confirmation before treating an order as paid
- Stricter gating than WooCommerce `processing`/`completed` alone

Sprint 16 documents this interaction point but does not implement AdfPay verification.

### 13. Deferred work

- Real HTTP webhook ingestion in `apps/api-server`
- WordPress plugin relay implementation
- Refund/cancel compensation flows
- Multi-line-item adapter fan-out
- Persistence-backed idempotency and execution runs
- Production secret management

## Consequences

**Positive**

- First real commerce adapter proves inbound gateway end-to-end without HTTP or persistence
- WooCommerce concepts remain outside `@dap/core`
- Explicit policies for status gating, identity, signatures, and multi-line-item rejection
- HMAC verification implemented as pure utility for future HTTP ingress reuse

**Negative / deferred**

- Multi-product orders are rejected until fan-out is designed
- Same order with distinct derived identities may execute fulfillment more than once across status transitions
- HTTP ingress and PHP connector remain stubs

## Related decisions

- [ADR-001](ADR-001-platform-core-independent-from-wordpress.md) — core independent from WordPress
- [ADR-002](ADR-002-wordpress-is-a-connector.md) — WordPress as connector
- [ADR-005](ADR-005-lord-tv-reference-implementation.md) — Lord TV reference stack
- [ADR-013](ADR-013-inbound-event-gateway.md) — inbound gateway contracts
- [ADR-014](ADR-014-execution-run-lifecycle.md) — execution run lifecycle

## Future consumption

- `apps/api-server` composes `WooCommerceEnvelopeFactory` + `WooCommerceInboundEventAdapter` at HTTP ingress
- `apps/wordpress-plugin` relays signed webhook payloads to api-server without fulfillment logic
- Additional storefront connectors follow the same adapter + envelope factory pattern
