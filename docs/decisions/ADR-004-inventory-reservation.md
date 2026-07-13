# ADR-004: Inventory Reservation

**Status:** Accepted  
**Date:** 2026-07-13  
**Owner:** Osama AL-Sharif

## Context

The Digital Automation Platform supports inventory-based delivery of digital assets such as codes, accounts, licenses, and tokens. Multiple automations may attempt to reserve inventory for different orders at the same time, especially during checkout spikes or webhook retries.

If two orders reserve the same asset, one customer may receive nothing while another receives a duplicate. That failure is difficult to detect after delivery and creates direct commercial and support risk.

## Decision

### 1. Inventory reservation must be atomic

Reservation is enforced at the `InventoryRepository` boundary through an atomic `reserveNextAvailable` operation. Repository implementations must guarantee that concurrent reservation attempts cannot claim the same item.

The in-memory reference implementation uses per-product reservation locks. Production implementations may use database row locks, compare-and-swap updates, or equivalent transactional primitives, but the concurrency guarantee remains mandatory.

### 2. Inventory logic remains provider-agnostic

Inventory entities, services, repositories, and events live in `@dap/core` without references to WooCommerce, Salla, Shopify, AdfPay, IPTV APIs, email providers, or other external systems.

Storefront connectors and provider adapters translate channel-specific order data into platform inventory commands. The inventory engine only understands generic concepts such as `productId`, `orderItemId`, and digital asset payloads.

### 3. Delivered assets are immutable by default

Once an inventory item transitions to `delivered`, it cannot automatically return to `available`. Delivery represents an irreversible fulfillment fact.

Released reservations may return an item to `available` only when the item has not been delivered. Disabled items cannot be reserved. These rules preserve audit integrity and prevent accidental reuse of already-delivered assets.

## Consequences

- Concurrent reservation safety depends on repository implementations honoring the atomic contract.
- Connectors remain thin; inventory orchestration stays in shared platform packages.
- Support and audit teams can trust that a delivered asset will not silently re-enter circulation.
- Future database-backed repositories must implement `reserveNextAvailable` with real transactional guarantees, not only application-level checks.

## Related components

- `packages/core/src/domain/inventory/inventory-item.ts`
- `packages/core/src/domain/inventory/inventory-repository.ts`
- `packages/core/src/application/inventory/inventory-service.ts`
