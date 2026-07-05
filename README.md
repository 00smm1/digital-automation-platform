# Digital Automation Platform

A scalable monorepo for digital commerce automation — orchestrating workflows, inventory, notifications, and third-party integrations across WordPress storefronts and internal tooling.

## Repository layout

```
digital-automation-platform/
├── apps/                    # Deployable applications
│   ├── wordpress-plugin/    # WooCommerce / WordPress integration
│   ├── api-server/          # Public and internal HTTP API
│   └── admin-dashboard/     # Operator and merchant UI
├── packages/                # Shared libraries and domain engines
│   ├── core/                # Domain models, config, and utilities
│   ├── automation-engine/   # Workflow orchestration and rules
│   ├── provider-sdk/        # External service adapters
│   ├── notification-engine/ # Email, SMS, and webhook delivery
│   └── inventory-engine/    # Stock sync and reservation logic
├── docs/                    # Architecture, ADRs, and runbooks
├── tests/                   # Cross-package integration and E2E tests
└── docker/                  # Local development and deployment images
```

## Design principles

- **Monorepo, clear boundaries** — Apps consume packages; packages never depend on apps.
- **Engine separation** — Automation, inventory, and notifications are independent engines with well-defined interfaces.
- **Provider abstraction** — All external integrations go through `provider-sdk`.
- **WordPress as a channel** — The plugin is a thin client; business logic lives in shared packages and the API.

## Getting started

> Application code and tooling are not yet implemented. See each directory's README for scope and planned responsibilities.

1. Review [docs/](docs/) for architecture and conventions.
2. Explore [apps/](apps/) and [packages/](packages/) README files for component boundaries.
3. Use [docker/](docker/) (when available) for local stack orchestration.

## Status

Initial project structure only — no application code at this stage.
