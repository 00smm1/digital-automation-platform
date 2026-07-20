# ADR-013: Inbound Event Gateway and Idempotency Contracts

**Status:** Accepted  
**Date:** 2026-07-20  
**Owner:** Osama AL-Sharif

## Context

Sprints 10–13 proved that normalized platform events can traverse automation matching, orchestration, and digital fulfillment pipelines entirely in memory. External systems (WooCommerce, Salla, Shopify, payment gateways) will deliver webhooks and polling payloads in vendor-specific shapes.

Without an explicit inbound boundary:

- Vendor mapping logic would leak into orchestration or fulfillment use cases
- Duplicate webhook delivery would re-run inventory, provisioning, and notification side effects
- HTTP ingress would be designed before idempotency semantics exist

Sprint 14 introduces a provider-neutral inbound integration boundary ahead of real connectors and webhook endpoints.

## Decision

### 1. External event envelope (provider-neutral)

Add `ExternalEventEnvelope` in `@dap/core` domain:

| Field             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `sourceId`        | Logical connector or channel identifier             |
| `externalEventId` | Provider-assigned event identifier                  |
| `eventType`       | External event name before normalization            |
| `receivedAt`      | Platform receipt timestamp                          |
| `payload`         | Opaque `unknown` until adapter validation           |
| `headers`         | Optional transport metadata (potentially sensitive) |
| `metadata`        | Optional auxiliary metadata                         |

Core contracts expose no vendor-specific fields. Payload uses `unknown`, not `any`.

### 2. Normalization belongs in inbound adapters

Add `InboundEventAdapter` application port:

- Input: `ExternalEventEnvelope`
- Output: `Result<NormalizedPlatformEvent, InboundEventNormalizationError>`

Adapters validate payloads, map external event names, extract references, and produce existing `NormalizedPlatformEvent` instances. The gateway contains no vendor-specific mapping logic.

Future WooCommerce, Salla, Shopify, and payment-gateway adapters implement this port in connector packages or test fakes.

### 3. Inbound event gateway application service

Add `InboundEventGateway`:

1. Accept envelope + adapter
2. Normalize through adapter
3. Reject malformed/unsupported events with typed results (no claim, no orchestration)
4. Build deterministic idempotency key from `sourceId` + `externalEventId`
5. Claim processing through idempotency store
6. Return duplicate result when key already exists
7. Forward newly accepted events to existing `PlatformEventOrchestrator`
8. Record final state (`completed` or `failed`) through idempotency store
9. Return structured `InboundProcessingResult`

The gateway does not bypass orchestration or the workflow pipeline.

### 4. Idempotency key semantics

```text
IdempotencyKey = `${sourceId}:${externalEventId}`
```

- Deterministic and stable across retries
- `receivedAt` and payload content are excluded from identity
- Same external event ID from different sources produces different keys
- Reuses string identity pattern aligned with `NormalizedPlatformEvent.eventId` (adapter sets `eventId` to the same composite for traceability)

ADR-010 documented a future orchestration-level deduplication point at `(eventId, automationId)`. Sprint 14 adds gateway-level deduplication at `(sourceId, externalEventId)` before orchestration executes. Both layers can coexist later.

### 5. Idempotency lifecycle states

Minimal lifecycle on `IdempotencyRecord`:

| State        | Meaning                                      |
| ------------ | -------------------------------------------- |
| `processing` | Claim succeeded; orchestration in progress   |
| `completed`  | Orchestration finished (including `noMatch`) |
| `failed`     | Orchestration failed or unexpected error     |

States are extensible without changing gateway behavior drastically.

### 6. Idempotency store port

Domain port `IdempotencyStore`:

- `claim` — atomic at contract level; fails if key exists
- `findByKey` — inspect current record
- `markCompleted` — after successful or non-fatal orchestration
- `markFailed` — after orchestration failure or unexpected processing error

`InMemoryIdempotencyStore` simulates atomic claim behavior deterministically using an in-memory map. No distributed locking.

### 7. Duplicate handling

When the same external event is submitted again:

- Orchestration executes at most once
- Later submissions return `InboundProcessingResult` with `status: 'duplicate'`
- Duplicate is not thrown as an unhandled exception
- Existing idempotency state (`completed`, `failed`, `processing`) is exposed when useful
- Inventory, provisioning, and notification side effects do not repeat

### 8. Failure behavior

| Scenario                              | Idempotency claim | Orchestration | Record state |
| ------------------------------------- | ----------------- | ------------- | ------------ |
| Normalization failure                 | No                | No            | None         |
| Claim/store failure                   | No                | No            | None         |
| Orchestration `failed`                | Yes               | Yes           | `failed`     |
| Orchestration success/partial/noMatch | Yes               | Yes           | `completed`  |
| Unexpected adapter exception          | No                | No            | None         |
| Unexpected orchestration exception    | Yes               | Partial       | `failed`     |

No automatic retry. Failed records remain failed until a future operational replay mechanism exists.

### 9. Sensitive data handling

- Raw payloads, headers, and secrets must not appear in error messages
- Safe identifiers (`sourceId`, `externalEventId`, `eventType`) may appear in rejection messages
- Tests assert sensitive values are absent from failure results

### 10. Composition and testing

`createInboundGatewayStack()` composes:

- `FakeInboundEventAdapter`
- `InboundEventGateway`
- `InMemoryIdempotencyStore`
- Actual `PlatformEventOrchestrator`, matcher, pipeline runner, and digital fulfillment stack

End-to-end tests prove the full path from external envelope through fulfillment without HTTP or vendor SDKs.

## Consequences

**Positive**

- Clear seam for future WooCommerce/Salla/Shopify/payment adapters
- Duplicate webhook delivery cannot double-fulfill in memory
- Orchestration and fulfillment remain vendor-agnostic
- Typed results support HTTP mapping in a future `api-server` sprint without changing core behavior

**Negative / deferred**

- In-memory idempotency does not survive process restart
- No distributed locking for concurrent workers
- No persistence-backed claim TTL or stale-`processing` recovery
- No HTTP ingress or webhook signature verification yet
- Orchestration-level `(eventId, automationId)` deduplication from ADR-010 remains future work

## Future connector integration

```text
External Systems (WooCommerce, Salla, Shopify, AdfPay, …)
    ↓
Inbound Adapters (vendor-specific, implement InboundEventAdapter)
    ↓
Inbound Event Gateway
    ↓
Idempotency Store Port (in-memory now; PostgreSQL/Redis later)
    ↓
Normalized Platform Event
    ↓
Automation Orchestrator
    ↓
Workflow Pipeline
    ↓
Business Ports (inventory, provisioning, notification)
```

HTTP controllers in `apps/api-server` will deserialize transport payloads into `ExternalEventEnvelope`, select the appropriate adapter, and delegate to `InboundEventGateway`. That work is explicitly deferred to Sprint 15+.

## Related decisions

- [ADR-010](ADR-010-event-orchestration-policy.md) — orchestration policy and future per-automation idempotency insertion point
- [ADR-012](ADR-012-first-digital-fulfillment-vertical-slice.md) — fulfillment pipeline reused by gateway E2E tests
