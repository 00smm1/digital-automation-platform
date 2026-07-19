# Roadmap

Phased delivery plan for the Digital Automation Platform.  
**Owner:** Osama AL-Sharif  
**Last updated:** Sprint 10 (automation definitions)

## Overview

| Phase | Name                               | Status          |
| ----- | ---------------------------------- | --------------- |
| 0     | Vision and repository foundation   | **Complete**    |
| 1     | Domain and execution foundation    | **Complete**    |
| 2     | Application orchestration          | **In progress** |
| 3     | Lord TV vertical slice             | Planned         |
| 4     | Persistence and reliable execution | Planned         |
| 5     | Operations dashboard               | Planned         |
| 6     | Inventory fulfillment              | Planned         |
| 7     | Additional connectors              | Planned         |
| 8     | Production hardening               | Planned         |

---

## Phase 0 — Vision and repository foundation

**Status:** Complete

**Delivered (Sprint 0)**

- Monorepo structure (`apps/`, `packages/`, `docs/`, `tests/`, `docker/`)
- Project vision, target architecture, decision log, and roadmap
- README documentation per top-level directory

**Exit criteria:** Team aligned on architecture; Lord TV reference flow documented; repository structure in place.

**Result:** Met. Foundation docs and directory layout exist.

---

## Phase 1 — Domain and execution foundation

**Status:** Complete (Sprints 1–8)

**Delivered**

| Sprint | Deliverable                                                               |
| ------ | ------------------------------------------------------------------------- |
| 1      | pnpm workspace, Turbo, TypeScript, ESLint, Prettier, Vitest, Husky        |
| 2      | Clean Architecture foundation in `@dap/core`                              |
| 3      | In-memory event bus                                                       |
| 4      | Automation pipeline domain and executor                                   |
| 5      | Inventory aggregate, reservation, in-memory repository, inventory service |
| 6      | Provider contracts, factory, registry, capabilities                       |
| 7      | Order processing — validation, execution plans, orchestration             |
| 8      | Workflow runtime — policies, metrics, history, lifecycle events           |

**Exit criteria:** Core domain modules compile, unit tests pass, and order-to-workflow execution can be exercised in memory without HTTP, database, or vendor SDKs.

**Result:** Met. `@dap/core` contains all implemented business logic; apps and engine packages remain stubs.

---

## Phase 2 — Application orchestration

**Status:** In progress (Sprint 10 partial)

**Focus:** Compose existing core modules into a coherent application layer with explicit contracts for definitions, matching, and durable run lifecycle — still in-memory where possible before persistence lands.

**Delivered (Sprint 10)**

- Automation definition domain model (`AutomationDefinition`, trigger, conditions, condition groups)
- Supported comparison operators with deterministic semantics
- Pure `RuleEvaluator` for field-path condition evaluation
- `AutomationMatcher` application service with priority ordering
- `AutomationDefinitionRepository` contract and in-memory implementation
- Unit and application-level tests; [ADR-009](decisions/ADR-009-automation-definitions.md)

**Remaining planned work**

- Action execution wiring through existing automation, inventory, provider, and workflow modules
- Idempotency contracts (keys, deduplication interfaces)
- Workflow persistence contracts (repository interfaces, run snapshots)
- Run lifecycle and failure handling (resume, abandon, compensating action hooks)
- First in-memory end-to-end vertical flow: synthetic event → rule match → order processing → workflow runtime

**Exit criteria:** A single automated test demonstrates event → matched rule → fulfilled order path entirely in memory, with documented idempotency and run lifecycle contracts ready for Phase 4 persistence.

**Result:** Not met. Sprint 10 completed definitions and matching only.

---

## Phase 3 — Lord TV vertical slice

**Status:** Planned

**Focus:** First real integration stack on staging using the Lord TV reference scenario.

**Planned work**

| Component                   | Location                       |
| --------------------------- | ------------------------------ |
| API server event ingestion  | `apps/api-server`              |
| WooCommerce connector       | `apps/wordpress-plugin`        |
| AdfPay verification adapter | `packages/provider-sdk`        |
| IPTV provider adapter       | `packages/provider-sdk`        |
| Email notification adapter  | `packages/notification-engine` |
| Staging end-to-end test     | `tests/`                       |

- Automation rule: paid order → verify payment → provision subscription → send email
- Idempotency on order ID with retry and backoff
- Optional order note update via connector callback

**Exit criteria:** A real WooCommerce test order in staging completes the full Lord TV pipeline with audit trail visible through API or logs.

---

## Phase 4 — Persistence and reliable execution

**Status:** Planned

**Focus:** Durable state and reliable asynchronous execution.

**Planned work**

- PostgreSQL for platform state
- Redis or queue abstraction for work distribution
- Schema migrations
- Durable workflow runs and execution history
- Distributed locks for reservation and run concurrency
- Retry policies backed by queue redelivery
- Dead-letter handling for exhausted failures
- Audit history persisted across restarts

**Exit criteria:** Process restart does not lose in-flight runs; failed steps land in dead-letter queue; inventory reservations survive restart until released or committed.

---

## Phase 5 — Operations dashboard

**Status:** Planned

**Focus:** Operator visibility and manual intervention without WordPress admin.

**Planned work**

- Operator authentication and authorization
- Run monitoring — active, completed, and failed executions
- Failed run replay from dashboard
- Provider connection management (AdfPay, IPTV, email)
- Basic metrics — throughput, failure rate, latency

**Exit criteria:** Operator diagnoses a failed Lord TV run and triggers replay from the dashboard without shell access.

---

## Phase 6 — Inventory fulfillment

**Status:** Planned

**Focus:** Production-grade inventory pools beyond in-memory reservation.

**Planned work**

- Persistent inventory pools in PostgreSQL
- Bulk import of codes, licenses, and accounts
- Reserve, commit, and release with transactional guarantees
- Low-stock alerts via notification engine
- Reconciliation reports for depleted and mismatched pools

**Exit criteria:** Product fulfilled from a persistent pool; API-based and inventory-based delivery coexist; low-stock alert fires when pool crosses threshold.

---

## Phase 7 — Additional connectors

**Status:** Planned

**Focus:** Prove the connector pattern beyond WordPress.

| Connector | Priority | Notes                     |
| --------- | -------- | ------------------------- |
| Salla     | High     | Regional Saudi storefront |
| Zid       | High     | Regional Saudi storefront |
| Shopify   | Medium   | Global SaaS storefront    |

Each connector maps channel events to platform canonical models. No engine rewrites required for basic order-paid flows.

**Exit criteria:** One non-WooCommerce connector passes integration tests against `api-server` in staging.

---

## Phase 8 — Production hardening

**Status:** Planned

**Focus:** Operate safely at production scale.

**Planned work**

- Observability — structured logging, metrics, tracing
- Security review and dependency audit
- Rate limits at API ingress
- Secrets management (no plain-text credentials in connectors)
- Backup and disaster recovery procedures
- Load testing and capacity baseline
- Deployment documentation and runbooks

**Exit criteria:** Production deployment checklist complete; load test demonstrates acceptable latency under expected peak; recovery drill documented and executed once in staging.

---

## Risks and dependencies

| Risk                         | Mitigation                                                      |
| ---------------------------- | --------------------------------------------------------------- |
| Scope creep in Phase 2       | Keep orchestration in-memory; defer persistence to Phase 4      |
| IPTV API instability         | Retries, dead-letter queue, manual replay (Phase 4–5)           |
| AdfPay webhook delays        | Poll payment status as fallback automation step                 |
| WordPress plugin maintenance | Keep plugin thin; versioned API contract                        |
| Engine/core duplication      | ADR-008 — core owns contracts; engines compose, do not redefine |

## Document maintenance

Update this roadmap at the end of each phase. Record scope changes in [DECISIONS.md](DECISIONS.md) and detailed sprint ADRs in [docs/decisions/](decisions/).
