# WordPress Plugin

WordPress and WooCommerce integration layer for the Digital Automation Platform.

## Purpose

Connect merchant storefronts to the platform with minimal surface area in PHP. The plugin handles authentication, event capture, and configuration — not core business logic.

## Planned responsibilities

- Register webhooks and REST endpoints for order, product, and customer events
- Secure communication with `api-server` (API keys, signed requests)
- Merchant settings UI within the WordPress admin
- Health checks and connection status for operators

## Dependencies

- `packages/core` — shared types and validation contracts
- `packages/provider-sdk` — optional direct adapters where WordPress-specific

## Out of scope

- Workflow execution (handled by `automation-engine` via API)
- Inventory calculations (handled by `inventory-engine` via API)
- Notification delivery (handled by `notification-engine` via API)

## Status

Structure only — no plugin code yet.
