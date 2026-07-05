# Core

Foundation library for the Digital Automation Platform.

## Purpose

Centralize domain models, configuration schemas, error types, and utilities used across all engines and applications.

## Planned contents

- **Domain models** — Order, Product, Customer, Automation, InventoryItem, Notification
- **Configuration** — Environment parsing, feature flags, tenant/merchant context
- **Contracts** — Interfaces that engines implement and apps consume
- **Utilities** — Logging, validation, idempotency helpers, date/money handling
- **Events** — Canonical event shapes for cross-service messaging

## Dependency rules

- `core` has **no** dependencies on other packages in this monorepo
- All other packages may depend on `core`

## Status

Structure only — no library code yet.
