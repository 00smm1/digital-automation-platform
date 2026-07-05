# API Server

Central HTTP API for the Digital Automation Platform.

## Purpose

Single entry point for automation triggers, inventory operations, notification requests, and admin actions. Serves both the WordPress plugin and the admin dashboard.

## Planned responsibilities

- Authenticate and authorize clients (merchants, services, dashboard users)
- Expose versioned REST (or GraphQL) endpoints for domain operations
- Route requests to automation, inventory, and notification engines
- Accept inbound webhooks from external providers
- Emit audit and observability events

## Dependencies

- `packages/core`
- `packages/automation-engine`
- `packages/inventory-engine`
- `packages/notification-engine`
- `packages/provider-sdk`

## Deployment

Runs as a stateless service behind a load balancer. Stateful workloads (queues, caches) are externalized. See `docker/` for local stack configuration.

## Status

Structure only — no server code yet.
