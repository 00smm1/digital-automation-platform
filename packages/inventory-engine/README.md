# Inventory Engine

Stock synchronization, reservation, and reconciliation for multi-channel commerce.

## Purpose

Maintain accurate inventory across WordPress storefronts, external marketplaces, and warehouse systems — with conflict resolution and audit trails.

## Planned responsibilities

- Real-time and batch stock sync between channels
- Reservation on checkout with TTL and release on cancellation
- Low-stock thresholds and automation triggers
- Reconciliation jobs and discrepancy reporting
- Multi-location and variant (SKU) support

## Dependencies

- `packages/core` — inventory domain models and events
- `packages/provider-sdk` — marketplace and WMS adapters

## Status

Structure only — no engine code yet.
