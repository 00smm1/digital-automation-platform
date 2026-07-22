# @dap/woocommerce-connector

WooCommerce inbound webhook adapter for the Digital Automation Platform.

## Purpose

Accept WooCommerce order webhook payloads, verify signatures, validate and map them into provider-neutral `@dap/core` contracts, and prove end-to-end processing through the existing inbound gateway stack.

## Allowed dependencies

- `@dap/core` — provider-neutral ports and contracts only

## Forbidden responsibilities

- HTTP servers or routing (belongs in `apps/api-server`)
- WordPress/PHP plugin code (belongs in `apps/wordpress-plugin`)
- Database, Redis, or queue infrastructure
- Outbound fulfillment provider adapters (belongs in `@dap/provider-sdk`)
- WooCommerce REST API client calls
- Domain or application logic duplication inside `@dap/core`

## Public exports

- `WooCommerceEnvelopeFactory` — signature verification and envelope creation
- `WooCommerceInboundEventAdapter` — `InboundEventAdapter` implementation
- `WooCommerceHmacSignatureVerifier` / `FakeWooCommerceSignatureVerifier`
- Order payload parser and typed connector errors
- `createWooCommerceInboundGatewayStack()` — test-focused composition root
- Fixtures for signed webhook inputs

## Why this package exists

The monorepo had no semantically correct home for storefront inbound adapters. `@dap/provider-sdk` is reserved for outbound fulfillment providers. `@dap/core` must remain vendor-neutral. This package implements ADR-015 as the first commerce connector.

See [ADR-015](../../docs/decisions/ADR-015-woocommerce-inbound-adapter.md).
