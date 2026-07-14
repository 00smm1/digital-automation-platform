# ADR-006: Order Processing Engine

**Status:** Accepted  
**Date:** 2026-07-13  
**Owner:** Osama AL-Sharif

## Context

Orders enter the platform from multiple sales channels. WooCommerce, custom storefronts, and future connectors all need a single, reliable way to fulfill purchases without duplicating business rules in each integration.

Without a dedicated order processing layer, fulfillment logic would leak into channel-specific plugins, making behavior inconsistent and hard to test.

## Decision

### 1. Order processing is isolated from sales channels

`Order`, `OrderItem`, and `OrderProcessingRequest` live in `@dap/core` as channel-agnostic domain models. Sales channels translate their payloads into these types and invoke `OrderProcessingService`. They do not implement inventory reservation, provider calls, or automation themselves.

This keeps WooCommerce and other connectors thin: they receive webhooks, map data, and delegate to core.

### 2. Execution plans coordinate fulfillment steps

`ExecutionPlanBuilder` inspects each order item's requirements and produces a deterministic plan:

1. Reserve inventory (when required)
2. Resolve providers (when required)
3. Execute automation pipelines (when configured)

Plans exist so orchestration is explicit, testable, and independent of any single channel's workflow. The same order shape produces the same plan regardless of whether it arrived from WooCommerce, an API, or a manual admin action.

### 3. Business logic never lives inside WooCommerce

WooCommerce is a connector, not the system of record for fulfillment. Plugin code must not:

- Reserve inventory directly
- Call provider APIs
- Encode product-specific fulfillment rules

All of that belongs in `@dap/core`, composed through dependency injection with the Inventory Engine, Provider SDK, Automation Engine, and Event Bus.

### 4. Processing publishes lifecycle events

`OrderProcessingService` emits:

- `OrderProcessingStarted`
- `OrderProcessingCompleted`
- `OrderProcessingFailed`

Downstream systems (notifications, analytics, channel sync) subscribe without coupling to the processing implementation.

## Consequences

- Fulfillment behavior is consistent across channels.
- Unit tests can exercise full order flows with in-memory engines and stub providers.
- New sales channels only need mapping and transport, not duplicated business rules.
- WooCommerce-specific code remains in `apps/wordpress-plugin`, not in core.

## Related components

- `packages/core/src/domain/order/order.ts`
- `packages/core/src/domain/order/execution-plan.ts`
- `packages/core/src/application/order/order-processing-service.ts`
- `packages/core/src/application/order/execution-plan-builder.ts`
- `packages/core/src/application/order/order-processor.ts`
