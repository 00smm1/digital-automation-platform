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

## Status

Sprint 2 foundation — base interfaces and abstract classes only. No commerce business logic yet.
