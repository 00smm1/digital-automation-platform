# Apps

Deployable applications that expose the platform to merchants, operators, and external systems.

## Applications

| Directory | Purpose |
|-----------|---------|
| [wordpress-plugin/](wordpress-plugin/) | WordPress / WooCommerce integration for storefronts |
| [api-server/](api-server/) | REST or GraphQL API for automation, inventory, and webhooks |
| [admin-dashboard/](admin-dashboard/) | Web UI for configuration, monitoring, and manual overrides |

## Dependency rules

- Apps **may** depend on any package under `packages/`.
- Apps **must not** import from sibling apps directly.
- Shared logic belongs in `packages/`, not duplicated across apps.

## Deployment

Each app is built and deployed independently. Container definitions and compose stacks live under `docker/`.
