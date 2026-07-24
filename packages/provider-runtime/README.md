# @dap/provider-runtime

Provider-neutral runtime for digital provisioning execution.

## Owns

- Provider references, descriptors, capabilities, status, and health models
- Provider registry and deterministic selection policy
- Provider execution request/context/result contracts
- Timeout and credential resolution boundaries
- Safe provider execution evidence and retry classification

## Does not own

- Inventory reservation or consumption
- Payment authorization
- Customer notification delivery
- Workflow ordering or execution-run lifecycle
- Concrete vendor adapters (those live outside this package)

## Composition

Register provider descriptors and adapters during application composition. Workflow steps depend on `ProviderRuntimePort`, not registry internals or fake adapters directly.

## Status (Sprint 19)

In-memory proof only — not production-ready.

- **Registry:** `InMemoryProviderRegistry` — lost on restart
- **Credentials:** `InMemoryCredentialResolver` — plain-text secrets in process memory
- **Execution:** one selection, one adapter call — no retry, no failover
- **Timeout:** local deadline only; timeout does **not** prove remote non-execution
- **Health:** configured on descriptors, not live-monitored
- **Idempotency:** forwarded to adapters; fake test adapter idempotency is **not universal**

See `docs/decisions/ADR-018-provider-runtime-and-provisioning-execution.md` and `docs/PACKAGE_BOUNDARIES.md`.
