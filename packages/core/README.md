# Core

Foundation library for the Digital Automation Platform.

## Architecture

`@dap/core` follows Clean Architecture and Domain-Driven Design. Business rules live in the domain layer; orchestration lives in the application layer; cross-cutting primitives live in shared.

```
src/
├── domain/
│   ├── entities/        # Entity, AggregateRoot
│   ├── value-objects/   # ValueObject
│   ├── events/          # DomainEvent, IDomainEventHandler
│   ├── repositories/    # IRepository
│   └── services/        # IDomainService
├── application/
│   ├── commands/        # ICommand
│   ├── queries/         # IQuery
│   └── handlers/        # ICommandHandler, IQueryHandler
└── shared/
    ├── errors/          # BaseError, DomainError, ApplicationError
    ├── types/           # Identifier, Result, utility types
    └── utils/           # Guard
```

## Dependency rules

- `domain` does not depend on `application`
- `application` may depend on `domain` and `shared`
- `shared` has no upward dependencies
- Apps and connectors consume `@dap/core`; `@dap/core` never depends on apps
- `@dap/core` may depend on `@dap/provider-runtime` for provisioning execution ports only

## Status

Sprint 19 — digital fulfillment pipeline with inventory reservation lifecycle and provider runtime integration for the provisioning step.

### Inventory reservation (Sprint 18)

- **Domain:** `domain/inventory/` — quantity validation, reservation model, transitions, repository port, in-memory atomic implementation
- **Application:** `application/inventory/` — reservation policy, `InventoryReservationService`, typed command/results
- **Workflow:** reserve → provision → consume → notify; release on provisioning failure
- **Owner:** execution-run reference (not email, customer name, or payment amount)
- **ADR:** `docs/decisions/ADR-017-inventory-reservation-lifecycle.md`

### Provider runtime integration (Sprint 19)

- **Dependency:** `@dap/provider-runtime` — workflow provisioning step uses `ProviderRuntimePort`
- **Workflow:** `provision-digital-product` maps reserve output into provider execution request; failure triggers reservation release (unchanged Sprint 18 policy)
- **Not in core:** provider registry, selection, timeout execution, credential resolution, or vendor adapters
- **ADR:** `docs/decisions/ADR-018-provider-runtime-and-provisioning-execution.md`

See `docs/PACKAGE_BOUNDARIES.md` for allowed dependencies and public exports.
