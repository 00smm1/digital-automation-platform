# Digital Automation Platform

A TypeScript monorepo for digital commerce automation — orchestrating orders, inventory, providers, workflows, and notifications across storefront connectors and internal tooling.

**Owner:** Osama AL-Sharif

## Current project status

The repository has completed **Phase 0** (vision and structure) and **Phase 1** (domain and execution foundation through Sprint 8). **Phase 2** (application orchestration) is in progress — Sprints 10–12 built matching, orchestration, and pipelines; **Sprint 13 proves the first in-memory digital fulfillment vertical slice** end to end. All substantive business logic lives in `@dap/core` as in-memory, provider-independent TypeScript.

What exists today:

- Clean Architecture foundations (entities, aggregates, value objects, CQRS contracts)
- In-memory event bus
- Automation pipeline execution
- **Automation definitions, triggers, conditions, and deterministic rule matching**
- **Event-to-workflow orchestration — matcher → workflow execution port → aggregate result**
- **Workflow execution pipeline — definitions, sequential steps, fatal-stop failure policy**
- **Digital fulfillment vertical slice — event → match → pipeline → inventory → provisioning → notification**
- Inventory reservation lifecycle
- Provider SDK contracts and registry
- Order processing and execution plans
- Workflow runtime with retry, timeout, cancellation, metrics, and history

What does **not** exist yet:

- HTTP API server, WordPress connector runtime, or admin dashboard application code
- Database persistence, queues, authentication, or production deployment
- Vendor adapters (AdfPay, IPTV, email SMTP), storefront integrations, or engine package implementations beyond stubs

## Completed capabilities (Sprints 0–13)

| Sprint | Capability                                                                                   |
| ------ | -------------------------------------------------------------------------------------------- |
| 0      | Monorepo structure, vision, architecture docs, decision log                                  |
| 1      | Workspace bootstrap — pnpm, Turbo, TypeScript, ESLint, Prettier, Vitest, Husky               |
| 2      | `@dap/core` Clean Architecture foundation — entities, errors, Result, Guard, CQRS markers    |
| 3      | In-memory event bus with handler isolation                                                   |
| 4      | Automation domain — pipelines, steps, executor, retry policy, execution log                  |
| 5      | Inventory domain — items, reservation, in-memory repository, inventory service               |
| 6      | Provider SDK — Provider, Factory, Registry, capabilities, request/response contracts         |
| 7      | Order processing — Order aggregate, validation, execution plans, orchestration service       |
| 8      | Workflow runtime — sequential execution, policies, metrics, history, lifecycle events        |
| 9      | Architecture baseline — package boundaries, roadmap alignment, ADR-008                       |
| 10     | Automation definitions — triggers, conditions, rule evaluator, matcher, in-memory repository |
| 11     | Event orchestration — workflow execution port, sequential multi-match, structured results    |
| 12     | Workflow pipeline — definitions, step executors, pipeline runner, fatal-stop execution       |
| 13     | Digital fulfillment vertical slice — ports, adapters, end-to-end in-memory composition       |

See [docs/ROADMAP.md](docs/ROADMAP.md) for phase planning and [docs/ARCHITECTURE_BASELINE.md](docs/ARCHITECTURE_BASELINE.md) for the current architecture snapshot.

## Repository architecture

```
digital-automation-platform/
├── apps/                    # Deployable applications (stubs today)
│   ├── wordpress-plugin/    # WooCommerce / WordPress connector
│   ├── api-server/          # HTTP API entry point
│   └── admin-dashboard/     # Operator UI
├── packages/
│   ├── core/                # Domain + application contracts (implemented)
│   ├── automation-engine/   # Future orchestration composition layer
│   ├── inventory-engine/    # Future inventory persistence/composition layer
│   ├── provider-sdk/        # Future vendor adapter implementations
│   └── notification-engine/ # Future notification delivery layer
├── docs/                    # Architecture, ADRs, roadmap
├── tests/                   # Cross-package integration tests (placeholder)
└── docker/                  # Local stack definitions (placeholder)
```

**Dependency direction:** `apps` → engine packages → `@dap/core`. Domain code never depends on apps or infrastructure. See [docs/PACKAGE_BOUNDARIES.md](docs/PACKAGE_BOUNDARIES.md).

## Package overview

| Package                    | Status          | Role                                                                                |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `@dap/core`                | **Implemented** | Provider-independent domain models, application services, in-memory implementations |
| `@dap/automation-engine`   | Stub            | Future automation composition and public API                                        |
| `@dap/inventory-engine`    | Stub            | Future inventory persistence and composition                                        |
| `@dap/provider-sdk`        | Stub            | Future vendor HTTP/SDK adapters                                                     |
| `@dap/notification-engine` | Stub            | Future email/SMS/webhook delivery                                                   |

## Development commands

Requires **Node.js ≥ 20** and **pnpm 10**.

```bash
pnpm install          # Install workspace dependencies
pnpm build            # Build all packages (Turbo)
pnpm test             # Run all unit tests (Vitest)
pnpm lint             # ESLint across workspaces
pnpm format           # Prettier write
pnpm format:check     # Prettier check without writing
```

Run commands for a single package:

```bash
pnpm --filter @dap/core test
pnpm --filter @dap/core build
```

## Design principles

- **Monorepo, clear boundaries** — Apps consume packages; packages never depend on apps.
- **Core owns contracts** — Business rules and domain models live in `@dap/core`; engine packages compose them later.
- **Provider abstraction** — Vendor details stay in adapters; core uses capability-oriented provider contracts.
- **WordPress as a channel** — The plugin is a thin connector; fulfillment logic stays in core and future engine layers.
- **In-memory first** — Current implementations are testable without database, queue, or network dependencies.

## Current limitations

- All state is in-memory; process restarts lose inventory reservations and workflow runs.
- No idempotency keys, durable workflow persistence, or dead-letter queues.
- Engine packages and apps are workspace stubs with no runtime behavior.
- No authentication, secrets management, observability, or deployment automation.
- Integration tests against real WooCommerce, AdfPay, or IPTV APIs are not implemented.

## Next milestone

**Phase 2 (continued) — Sprint 11+:** wire matcher output to order processing and workflow runtime, add idempotency and workflow persistence contracts, and deliver the first in-memory end-to-end vertical flow. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

| Document                                                       | Description                            |
| -------------------------------------------------------------- | -------------------------------------- |
| [docs/PROJECT_VISION.md](docs/PROJECT_VISION.md)               | Product vision and goals               |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Target system design                   |
| [docs/ARCHITECTURE_BASELINE.md](docs/ARCHITECTURE_BASELINE.md) | Architecture as built after Sprint 8   |
| [docs/PACKAGE_BOUNDARIES.md](docs/PACKAGE_BOUNDARIES.md)       | Package ownership and dependency rules |
| [docs/ROADMAP.md](docs/ROADMAP.md)                             | Phased delivery plan                   |
| [docs/DECISIONS.md](docs/DECISIONS.md)                         | Architecture decision index            |
| [docs/decisions/](docs/decisions/)                             | Detailed sprint ADRs                   |
