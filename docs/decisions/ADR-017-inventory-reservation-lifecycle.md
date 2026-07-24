# ADR-017: Inventory Reservation Lifecycle

**Status:** Accepted  
**Date:** 2026-07-22  
**Owner:** Osama AL-Sharif

## Context

Prior sprints proved digital fulfillment through workflow pipelines with an inventory **reserve** step backed by per-item or implicit availability checks. A boolean or best-effort reserve call is insufficient for production-grade digital commerce:

- Availability and reservation state were implicit or split across unrelated calls
- Failed provisioning could leave inventory permanently reserved
- Successful provisioning did not atomically consume reserved quantity
- Duplicate workflow execution could decrement availability more than once
- No explicit expiration returned stale reservations to availability

Sprint 18 introduces a provider-neutral **reservation lifecycle** in `@dap/core` with explicit states, atomic repository boundaries, and workflow integration (reserve → provision → consume / release).

## Decision

### 1. Quantity-based inventory pools

Introduce `QuantityInventoryRecord` with explicit accounting:

```
Available = Total − Reserved − Consumed
```

All quantities are safe integers. No floating-point inventory.

### 2. Reservation state machine

| State      | Meaning                                   | Terminal |
| ---------- | ----------------------------------------- | -------- |
| `reserved` | Quantity held for an owner until deadline | No       |
| `consumed` | Reserved quantity permanently used        | Yes      |
| `released` | Reservation cancelled; quantity returned  | Yes      |
| `expired`  | Deadline passed; quantity returned        | Yes      |

Valid transitions:

- `reserved → consumed`
- `reserved → released`
- `reserved → expired`

Terminal states are immutable. Same terminal command is idempotent; different terminal command on terminal state returns invalid-transition.

### 3. Ownership model

**Primary owner:** `ExecutionRunReference` (inbound gateway execution run id).

**Correlation metadata:** optional `externalOrderReference` — not used as duplicate key.

Forbidden owner identities: customer email, customer name, payment amount, timestamps, arbitrary metadata.

**Duplicate key:** `{ownerReference}:{inventoryItemReference}`

After terminal completion (consumed / released / expired), the same owner cannot create a new reservation for the same item requirement — returns conflict.

### 3.1 Reservation reference generation

`ReservationReferenceFactory` is an **explicit required dependency** of `InventoryReservationService`. Composition roots inject a factory; the service does not default to a deterministic counter.

- **Tests:** `DeterministicReservationReferenceFactory` (predictable `reservation-1`, `reservation-2`, …)
- **Composition:** `SequentialReservationReferenceFactory` or `createCompositionReservationReferenceFactory()` with instance-scoped namespace (e.g. UUID prefix) so independently composed services sharing a repository cannot silently collide on `reservation-1`

Domain and application code do not generate random IDs directly outside injected factories.

### 3.2 Identity separation

`InventoryItemReference` and `ReservationReference` are distinct concepts. Provisioning requests carry both explicitly. Provisioning quantity comes from the successful reserve step output — never from untrusted event metadata and never defaulted to `1`.

### 3.3 Invalid transitions report actual state

When a transition is invalid, public results include the **cloned current reservation** (reference, owner, item, quantity, actual terminal status). Application code must never fabricate empty references, zero quantity, or incorrect status in failure results.

### 3.4 Reference validation

Consume, release, and expire commands validate `reservationReference` through `parseReservationReference` at the application boundary. Invalid references return typed `invalid-reservation-reference` results without repository transitions.

### 3.5 Workflow timing

All fulfillment step timestamps derive from an injected `Clock` passed through the step registry. No `new Date()` fallback and no use of untrusted `metadata.occurredAt` as the operational clock.

### 3.6 Provisioning cleanup policy

After provisioning failure, cleanup succeeds **only** when release proves the reservation is released (`reservation-released` or idempotent terminal `released`). All other release outcomes (`reservation-not-found`, non-released terminal state, `partial-processing`, `repository-failed`, etc.) produce controlled `partial-processing` with `reservationReleased: false`.

### 4. Atomic reservation

`InventoryReservationRepository.tryReserve` evaluates item existence, duplicate state, availability, reservation creation, and inventory update in **one serialized operation** per inventory item.

Production persistence must provide equivalent transactional or compare-and-set behavior. In-memory implementation uses per-item promise locks — **not** distributed safety.

### 5. Expiration semantics

- Expired when `now >= expiresAt`
- Consume allowed only when `status === reserved` and `now < expiresAt`
- `expireDueReservations(now)` expires all due active reservations deterministically
- Lookup exceptions return typed `repository-failed`; invalid `now` returns `invalid-expiration-time`; command `now` is validated and cloned
- No scheduler or background worker in Sprint 18

### 6. Workflow integration

Pipeline order:

1. Validate order
2. Reserve inventory (concrete reservation reference)
3. Provision digital product
4. Consume reservation (only after provisioning success)
5. Notify customer (only after consumption success)

On provisioning failure: release reservation **exactly once** before controlled failure. Cleanup exceptions are converted into safe `partial-processing` outcomes and never invoke a second release attempt.

### 7. Partial failures

| Scenario                                          | Outcome                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Provisioning succeeds, consume fails              | `partial-processing` — no auto re-provision                                  |
| Provisioning fails, release fails or throws       | `partial-processing` — both failures surfaced safely; release attempted once |
| Consumption + notification succeeds, notify fails | Notification failure only; reservation stays consumed                        |

`expireDueReservations` batches may skip reservations that became consumed or released after lookup. Skipped terminal reservations increment `skippedTerminalCount`, not `expiredCount`. Summary counts satisfy `expiredCount + skippedTerminalCount + failedCount === inspectedCount`.

No claim of exactly-once or distributed transactional semantics.

### 8. Security

Reservation records, failures, workflow results, execution-run audit, and expiration summaries must not contain provider credentials, provisioning passwords, webhook signatures, raw payloads, or repository internals.

## Consequences

### Benefits

- Explicit inventory lifecycle aligned with fulfillment workflow
- Duplicate reservation prevention per execution run
- Controlled compensation on provisioning failure
- Deterministic expiration without scheduler infrastructure
- Provider-neutral domain suitable for future persistence adapters

### Limitations

- In-memory repository only
- Single-process concurrency simulation
- No partial reservations
- No backorders, multi-location inventory, or warehouse integration
- Reconciliation after partial-processing deferred

### Deferred production work

- SQL / durable persistence
- Transactional compare-and-set
- Distributed locking
- Expiration worker / scheduler
- Reconciliation jobs
- Compensation engine
- Inventory import pipelines
- Production monitoring

## Related

- [ADR-004 Inventory reservation (legacy per-item)](../decisions/ADR-004-inventory-reservation.md)
- [ADR-012 First digital fulfillment vertical slice](../decisions/ADR-012-first-digital-fulfillment-vertical-slice.md)
- [ADR-016 Payment confirmation and authorization](../decisions/ADR-016-payment-confirmation-and-authorization.md)
