# ADR-008: Core and Engine Package Boundaries

**Status:** Accepted  
**Date:** 2026-07-19  
**Owner:** Osama AL-Sharif

## Context

Through Sprint 8, all domain and application logic was implemented inside `@dap/core` because the priority was establishing correct contracts, testability, and Clean Architecture boundaries before adding infrastructure.

Engine packages (`automation-engine`, `inventory-engine`, `notification-engine`) and `provider-sdk` exist as workspace stubs. As the platform moves into Phase 2 (application orchestration) and Phase 3 (Lord TV vertical slice), there is a risk that:

- Business rules get duplicated between core and engine packages
- Vendor or persistence concerns leak into domain models
- Dependency direction reverses (core importing engines or apps)

A explicit boundary decision is needed before new code lands in engine packages.

## Decision

### 1. Core owns provider-independent contracts

`packages/core` remains the canonical home for:

- Domain models, value objects, aggregates, and domain events
- Application service interfaces and in-memory orchestration
- Provider **contracts** (not vendor implementations)
- CQRS markers, shared errors, and cross-cutting primitives

Core must not contain HTTP clients, database drivers, queue libraries, or vendor SDKs.

### 2. Engine packages own composition and infrastructure

Engine packages will own:

- Infrastructure-aware orchestration and runtime composition
- Persistence adapters implementing core repository interfaces
- Public package entry points consumed by apps
- Wiring between core services, provider adapters, and future queues

Engine packages **may re-export or compose** core contracts. They **must not redefine** equivalent domain models (e.g. a second `InventoryItem` type).

### 3. Provider SDK owns vendor adapters

`packages/provider-sdk` implements core `Provider` and `ProviderFactory` interfaces for specific vendors (AdfPay, IPTV, email). Capability names and request/response shapes remain defined in core.

### 4. No duplication of business rules

Business invariants (reservation rules, order validation, workflow state transitions) live exclusively in core. Engine packages add persistence, transport, and operational concerns — not alternate business logic.

## Consequences

- Phase 2 work can add orchestration to engine packages without moving or copying domain models.
- Unit tests remain focused in `@dap/core` with in-memory implementations.
- Vendor swaps affect `provider-sdk` only; core automation and order logic stay unchanged.
- Apps depend on engines for runtime wiring; engines depend on core for contracts.
- Existing Sprint 1–8 code in core is **not moved** during Sprint 9; migration happens incrementally when engine features are implemented.

## Alternatives considered

### Alternative A: Move all logic out of core into engine packages now

**Rejected.** Would be a large refactor with no functional benefit before persistence or HTTP exists. High risk of breaking tests and APIs.

### Alternative B: Keep everything in core permanently

**Rejected.** Would eventually force HTTP, ORM, and vendor SDK dependencies into core, violating Clean Architecture and testability goals.

### Alternative C: Duplicate domain models in each engine for autonomy

**Rejected.** Creates inconsistent business rules and mapping overhead between packages.

### Alternative D: Core + engine boundaries with incremental migration (chosen)

Accept temporary concentration of logic in core; engine packages compose core as features arrive. Documented and enforced via ADR and package boundary docs.

## Migration guidance

When implementing engine package features:

1. **Identify the core contract** — repository interface, service, or provider factory already in `@dap/core`.
2. **Implement adapter in engine/SDK** — e.g. `PostgresInventoryRepository implements InventoryRepository`.
3. **Compose in engine entry point** — e.g. `createInventoryEngine({ repository, eventBus })` returns configured `InventoryService`.
4. **Do not copy domain types** — import from `@dap/core`.
5. **Add integration tests** in engine package; keep domain unit tests in core.
6. **Update PACKAGE_BOUNDARIES.md** when an engine package moves from stub to implemented.

When wiring order processing to workflow runtime (Phase 2):

- Keep `ExecutionPlan` and `WorkflowPlan` in core
- Engine or application composition layer registers step executors that delegate to inventory, provider, and automation services

## Related documents

- [docs/PACKAGE_BOUNDARIES.md](../PACKAGE_BOUNDARIES.md)
- [docs/ARCHITECTURE_BASELINE.md](../ARCHITECTURE_BASELINE.md)
- [docs/ROADMAP.md](../ROADMAP.md)

## Related components

- `packages/core/`
- `packages/automation-engine/`
- `packages/inventory-engine/`
- `packages/notification-engine/`
- `packages/provider-sdk/`
