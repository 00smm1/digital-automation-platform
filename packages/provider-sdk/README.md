# Provider SDK

Unified adapter layer for external services and third-party integrations.

## Purpose

Isolate provider-specific APIs behind stable interfaces so engines and apps remain provider-agnostic.

## Planned provider categories

| Category        | Examples                           |
| --------------- | ---------------------------------- |
| Commerce        | WooCommerce, Shopify, marketplaces |
| Payments        | Stripe, PayPal, regional gateways  |
| Shipping        | Carriers, fulfillment APIs         |
| ERP / WMS       | Inventory and order sync systems   |
| CRM / Marketing | Customer data and campaign tools   |

## Planned structure

- Common interface per category (e.g. `PaymentProvider`, `ShippingProvider`)
- Per-vendor implementations with configuration-driven registration
- Rate limiting, circuit breaking, and structured error mapping
- Webhook signature verification helpers

## Dependencies

- `packages/core` — shared types and configuration

## Status

Structure only — no SDK code yet.
