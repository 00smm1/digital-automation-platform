# Packages

Shared libraries and domain engines consumed by applications under `apps/`.

## Packages

| Directory | Purpose |
|-----------|---------|
| [core/](core/) | Domain models, configuration, logging, and cross-cutting utilities |
| [automation-engine/](automation-engine/) | Workflow definitions, triggers, and execution |
| [provider-sdk/](provider-sdk/) | Adapters for payment, shipping, ERP, and marketplace providers |
| [notification-engine/](notification-engine/) | Multi-channel message delivery and templating |
| [inventory-engine/](inventory-engine/) | Stock levels, reservations, and sync orchestration |

## Dependency graph

```
                    ┌─────────────┐
                    │    core     │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌───────────────┐ ┌─────────────┐ ┌──────────────────┐
   │ provider-sdk  │ │ automation- │ │ notification-    │
   │               │ │   engine    │ │     engine       │
   └───────────────┘ └──────┬──────┘ └──────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  inventory-   │
                    │    engine     │
                    └───────────────┘
```

Engines may depend on `core` and `provider-sdk`. They must not depend on `apps/`.

## Versioning

Packages are versioned together within this monorepo. Breaking changes require coordinated updates across consuming apps.
