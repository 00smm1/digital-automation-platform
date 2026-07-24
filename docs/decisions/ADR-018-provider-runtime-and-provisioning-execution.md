# ADR-018: Provider Runtime and Provisioning Execution

**Status:** Accepted  
**Date:** 2026-07-24  
**Owner:** Osama AL-Sharif

## Context

Sprint 18 proved quantity-based inventory reservation with explicit reserve → provision → consume → notify ordering. The provisioning step still invoked a fake `DigitalProductProvisioningPort` adapter directly inside `@dap/core`, with no provider discovery, selection, timeout boundary, credential isolation, or safe execution evidence.

Production digital fulfillment requires:

- Provider-neutral discovery and deterministic selection among registered adapters
- Explicit execution attempt identity separate from business idempotency
- Timeout boundaries that do not falsely claim remote non-execution
- Safe audit projections without credential or delivery secret leakage
- Workflow integration that preserves Sprint 18 reservation cleanup ownership

Sprint 19 introduces `@dap/provider-runtime` as a dedicated package and rewires the provisioning workflow step to depend on `ProviderRuntimePort`.

## Decision

### 1. Runtime boundary

`@dap/provider-runtime` owns provider discovery, selection, timeout-wrapped execution, and safe result/evidence projection. It does **not** own inventory reservation, payment authorization, customer notification, workflow ordering, or execution-run lifecycle.

The workflow `provision-digital-product` step depends on `ProviderRuntimePort`, not registry internals, credential resolvers, or fake adapters directly.

`@dap/core` depends on `@dap/provider-runtime` for the port contract and audit projection helpers. `@dap/provider-runtime` does **not** depend on `@dap/core`.

Concrete vendor adapters (IPTV API, future `provider-sdk` HTTP clients) implement `ProviderAdapter` outside the runtime and register at composition time.

### 2. Provider descriptor

`ProviderDescriptor` is the registry entry for a provider:

| Field                   | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `providerReference`     | Stable provider identity                      |
| `providerKind`          | Provider category (e.g. digital provisioning) |
| `supportedCapabilities` | Non-empty capability list                     |
| `status`                | Operational enablement                        |
| `health`                | Configured health preference input            |
| `priority`              | Non-negative safe integer tie-breaker         |
| `credentialReference`   | Indirection to credential resolver            |
| `metadata`              | Optional safe string map                      |

Descriptors are validated at creation and cloned on read/write paths. Registry stores descriptor + adapter pairs; runtime never mutates registered descriptors in place.

### 3. Registry

`ProviderRegistry` port exposes:

- `listDescriptorsByCapability(capability)` — returns cloned descriptors
- `resolveAdapter(providerReference)` — returns the registered adapter or `undefined`

Sprint 19 ships `InMemoryProviderRegistry` only. **Registry is in-memory only** — lost on restart, no cross-process visibility, no durable provider configuration.

### 4. Capability

`ProviderCapability` is a validated string brand (e.g. `digital-subscription-provisioning`). Execution requests declare `requiredCapability`; selection filters descriptors whose `supportedCapabilities` include it.

Capabilities are provider-neutral. Vendor-specific product codes belong in `provisioningParameters`, not capability names.

### 5. Status

| Status        | Eligible for selection |
| ------------- | ---------------------- |
| `active`      | Yes                    |
| `disabled`    | No                     |
| `maintenance` | No                     |

Only `active` providers participate in selection. Disabled or maintenance-only candidates produce `NO_ACTIVE_PROVIDER`.

### 6. Health

| Health      | Eligible for selection | Preference order |
| ----------- | ---------------------- | ---------------- |
| `healthy`   | Yes                    | 1 (best)         |
| `degraded`  | Yes                    | 2                |
| `unknown`   | Yes                    | 3                |
| `unhealthy` | No                     | —                |

**Health is configured on the descriptor, not monitored.** Sprint 19 does not probe remote endpoints, track latency, or auto-update health. Operators (or future reconciliation jobs) set health at registration time. Selection prefers healthier configured groups, then applies priority and lexicographic provider reference tie-breaking.

### 7. Priority

`ProviderPriority` is a non-negative safe integer. Higher numeric priority wins within the same health group. Equal priority resolves by lexicographic `providerReference`.

### 8. Selection

`ProviderSelectionPolicy` applies deterministic filters in order:

1. Capability match
2. Optional `providerKind` constraint
3. Optional permitted provider reference allow-list
4. Optional excluded provider reference deny-list
5. Active status
6. Health eligibility
7. Best health group → highest priority → lexicographic reference

Exactly **one** provider is selected per execution. No ranking list is returned for automatic failover.

Selection failure codes: `NO_PROVIDER_SUPPORTS_CAPABILITY`, `NO_ACTIVE_PROVIDER`, `NO_ELIGIBLE_PROVIDER_HEALTH`, `PROVIDER_SELECTION_CONFLICT`.

### 9. Credential boundary

Credentials resolve through `CredentialResolverPort` inside the adapter boundary — not in workflow steps or the runtime orchestration loop.

- Runtime passes `credentialReference` from the selected descriptor into `ProviderExecutionContext`
- Adapters call the resolver; runtime does not read secret values
- Resolution outcomes: `credential-resolved`, `credential-not-found`, `credential-access-denied`, `credential-resolution-failed`
- **Credentials are in-memory only** via `InMemoryCredentialResolver` in Sprint 19 — no vault, no encryption at rest, no rotation

Secret values must never appear in runtime results, workflow step outputs, execution-run audit records, or safe evidence projections.

### 10. Attempt identity

Each execution creates a fresh `ProviderExecutionAttemptReference` via an injected `ProviderExecutionAttemptReferenceFactory`.

- **Tests:** `DeterministicProviderExecutionAttemptReferenceFactory`
- **Composition:** instance-scoped or sequential factory to avoid cross-instance collision

Attempt reference identifies **this invocation**. It is distinct from business idempotency and from external provisioning references returned on success.

### 11. Business idempotency

`BusinessIdempotencyReference` is carried on every execution request and passed to adapters.

- Default: derived from `executionRunReference` when caller omits explicit value
- Callers may supply an explicit reference when policy requires a different business key

The runtime forwards the reference to adapters but does **not** enforce idempotency itself. **Fake adapter idempotency in tests is not universal** — production adapters may or may not honor the reference. Duplicate remote provisioning remains possible without provider-side deduplication or future reconciliation.

### 12. Timeout semantics

`ProviderTimeoutPolicy` defines `defaultTimeoutMilliseconds` with optional per-capability and per-provider overrides. Positive safe integers only.

`TimeoutExecutor` wraps adapter `execute()`:

- Operation completes within budget → adapter result proceeds normally
- Budget exceeded → `provider-timeout` failure with `retry-after-reconciliation`

Timeouts use injected clock and deterministic test executors; production may use `TimerTimeoutExecutor`.

### 13. Timeout ambiguity

**Timeout does not prove remote non-execution.** A timed-out adapter call may have succeeded remotely after the local deadline. Timeout outcomes classify as `retry-after-reconciliation`, not `retry-not-safe` or automatic retry.

Operators must reconcile with the provider using `executionAttemptReference`, `businessIdempotencyReference`, and correlation metadata before re-attempting provisioning.

### 14. No retry

`ProviderRuntime` performs **exactly one** selection and **exactly one** adapter invocation per `executeProvisioning` call. There is no internal retry loop, exponential backoff, or re-invocation of the same adapter within a single call.

`RetryClassification` on results is **advisory metadata** for future orchestration — Sprint 19 does not act on it automatically.

### 15. No failover

When the selected provider fails (rejection, unavailable, timeout, exception, invalid response), the runtime returns failure immediately. It does **not** select the next eligible provider, retry with a fallback, or loop over candidate lists.

Failover requires explicit future policy outside this runtime (e.g. operator replay with different permitted references).

### 16. Adapter isolation

`ProviderAdapter` implements vendor-specific HTTP/SDK logic behind a narrow contract:

```
execute(request, context) → ProviderAdapterResult
```

Adapter result kinds: `provider-adapter-succeeded`, `provider-adapter-rejected`, `provider-adapter-unavailable`, `credential-resolution-failed`, `provider-adapter-invalid-response`.

Adapters must not import workflow, inventory, payment, or connector packages. Runtime depends on `ProviderRegistry` port, not `InMemoryProviderRegistry` concrete type.

### 17. External provisioning reference

On success, adapters return `externalProvisioningReference` — a validated non-empty branded string identifying the remote provisioning record.

Runtime validates the reference before accepting success. Empty or invalid values map to `invalid-provider-response` with `retry-after-reconciliation`.

This reference is the canonical remote identity for future reconciliation — not the execution attempt reference.

### 18. Delivery material reference

Optional `deliveryMaterialReference` on adapter success (e.g. license key handle, account identifier safe for customer delivery).

Runtime validates when present. Notification step may include it in customer message body. Delivery secrets must not be embedded in references or safe evidence.

### 19. Retry classification

| Classification               | Meaning                                        |
| ---------------------------- | ---------------------------------------------- |
| `retry-not-safe`             | Re-attempt likely duplicates or worsens state  |
| `retry-may-be-safe`          | Transient failure; retry may succeed           |
| `retry-after-reconciliation` | Ambiguous remote state; reconcile before retry |
| `retry-not-applicable`       | Success — no retry decision needed             |

Mapped from failure kind (e.g. timeout → `retry-after-reconciliation`, rejection → `retry-not-safe`). Classification is surfaced in workflow step output and safe evidence; no automatic retry behavior in Sprint 19.

### 20. Safe evidence

`ProviderExecutionEvidence` captures audit-safe execution metadata:

- Provider and attempt references
- Capability and business idempotency reference
- Timestamps (`startedAt`, `completedAt`, `failedAt`)
- `timeoutClassification` (`completed`, `timed-out`, `not-applicable`)
- `safeResultCode` and `retryClassification`

`projectProviderExecutionEvidenceForAudit` produces string-only projections for workflow and execution-run consumption. No credentials, stack traces, raw adapter payloads, or secret-bearing fields.

### 21. Workflow integration

Pipeline order unchanged from Sprint 18:

1. Validate order
2. Reserve inventory
3. **Provision digital product** (via `ProviderRuntimePort`)
4. Consume reservation
5. Notify customer

Provisioning step maps reserve-step output (reservation reference, item reference, quantity) and fulfillment input into `ProviderExecutionRequest`. Capability fixed to `digital-subscription-provisioning` for the digital product vertical slice; parameters derived from product reference.

On runtime failure, step invokes reservation release exactly once (Sprint 18 cleanup policy). Success output includes provider reference, attempt reference, external provisioning reference, optional delivery material reference, and safe evidence projection.

### 22. Reservation cleanup ownership

**Provisioning step owns reservation release on provisioning failure.** `@dap/provider-runtime` does not call inventory ports.

Release succeeds only when `InventoryReservationLifecyclePort.releaseReservation` proves `released` terminal state (or idempotent release). All other cleanup outcomes produce controlled `partial-processing` with `reservationReleased: false`. No second release attempt.

Provider runtime failures (selection, timeout, rejection, exception) all trigger the same cleanup path.

### 23. Consumption failure ambiguity

When provisioning succeeds but consumption fails, outcome is `partial-processing`:

- Remote provisioning may have completed
- Reservation remains in `reserved` state (not consumed)
- No automatic re-provision or automatic release

Reconciliation must determine whether to consume, release, or compensate. Sprint 19 surfaces failure codes and reservation state safely; it does not resolve the ambiguity automatically.

### 24. Notification ordering

Notification runs **only after successful consumption**. `notify-customer` step checks consume-step success; provisioning success alone is insufficient.

Notification may reference `deliveryMaterialReference` or `externalProvisioningReference` from provisioning output. Notification failure does not roll back consumption or provisioning.

### 25. Execution-run / audit safety

`projectProviderRuntimeResultForExecutionRun` strips sensitive fields before execution-run recording. Workflow provisioning output uses `projectProviderExecutionEvidenceForAudit` for evidence.

Execution-run audit, pipeline step outputs, and gateway results must not contain provider secrets, credential resolver internals, adapter exception messages, or stack traces.

### 26. Security

- Credentials resolved only inside adapters via port; never logged or returned
- Safe metadata on descriptors is string-only key/value
- Adapter success responses rejecting `safeEvidence.secret` string fields
- Sentinel tests verify absence of secret patterns across success, failure, timeout, and projection paths
- Fake adapter invocations record references and quantities, not secret values

### 27. In-memory limitations

| Component             | Sprint 19 implementation      | Limitation                          |
| --------------------- | ----------------------------- | ----------------------------------- |
| Provider registry     | `InMemoryProviderRegistry`    | Lost on restart; single process     |
| Credential resolver   | `InMemoryCredentialResolver`  | Plain-text secrets in memory        |
| Fake provider adapter | Test-only idempotency store   | Not production semantics            |
| Timeout executor      | Deterministic + timer options | No distributed deadline propagation |

No claim of production-grade provider operations, HA failover, or durable execution history within provider-runtime.

### 28. Deferred production work

- Durable provider registry and credential vault
- Live health monitoring and auto-degradation
- Provider reconciliation API (lookup by attempt / idempotency key)
- Automatic retry and failover policies (explicitly out of scope for Sprint 19)
- Real IPTV / vendor HTTP adapters in `provider-sdk`
- Cross-run idempotency store at platform level
- Production timeout tuning per vendor SLA

## Consequences

### Benefits

- Clear boundary between workflow orchestration and provider execution
- Deterministic, testable provider selection without vendor leakage
- Explicit timeout and ambiguity semantics prevent false confidence
- Safe audit trail for provisioning attempts
- Provisioning step decoupled from fake adapter; ready for real adapter registration

### Limitations

- In-memory registry and credentials only
- No retry, failover, or reconciliation engine
- Health is static configuration
- Business idempotency depends on adapter behavior
- Timeout cannot distinguish remote success from remote failure

## Alternatives considered

| Alternative                                    | Rejected because                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Keep provisioning port inside `@dap/core`      | Would grow core with selection, timeout, and credential concerns               |
| Automatic failover to next provider on failure | Masks primary provider errors; complicates inventory and idempotency           |
| Runtime-enforced idempotency store             | Requires durable cross-run state; premature before reconciliation sprint       |
| Treat timeout as proof of non-execution        | Unsafe for billing and inventory; causes duplicate provisioning on blind retry |
| Live health probes in Sprint 19                | Adds infrastructure dependency; static health sufficient for in-memory proof   |
| Retry loop inside `ProviderRuntime`            | Hides failure taxonomy; conflicts with execution-run audit and reconciliation  |

## Related

- [ADR-012 First digital fulfillment vertical slice](../decisions/ADR-012-first-digital-fulfillment-vertical-slice.md)
- [ADR-017 Inventory reservation lifecycle](../decisions/ADR-017-inventory-reservation-lifecycle.md)
- [ADR-005 Provider SDK abstraction](../decisions/ADR-005-provider-sdk.md)
- [PACKAGE_BOUNDARIES.md](../PACKAGE_BOUNDARIES.md)
