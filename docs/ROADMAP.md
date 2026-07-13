# Roadmap

Phased delivery plan for the Digital Automation Platform.  
**Owner:** Osama AL-Sharif

## Overview

| Phase | Name                   | Goal                                                |
| ----- | ---------------------- | --------------------------------------------------- |
| 0     | Platform foundation    | Vision, architecture, monorepo structure, decisions |
| 1     | Core + API skeleton    | Domain models, event ingress, health and auth       |
| 2     | Lord TV vertical slice | WooCommerce → AdfPay → IPTV API → email             |
| 3     | Inventory delivery     | License pool, reservation, allocation               |
| 4     | Admin dashboard        | Rule config, run monitoring, manual replay          |
| 5     | Additional connectors  | Salla, Zid, Shopify                                 |

---

## Sprint 0 — Platform foundation ✓ (current)

**Deliverables**

- [x] Monorepo structure (`apps/`, `packages/`, `docs/`, `tests/`, `docker/`)
- [x] Project vision, architecture, roadmap, and decision log
- [ ] Development environment (Docker Compose, linting, CI stub)
- [ ] Connector contract specification (OpenAPI event schema draft)

**Exit criteria:** Team aligned on architecture; Lord TV flow documented; no application code required yet.

---

## Phase 1 — Core + API skeleton

**Focus:** Runnable platform with no storefront attached.

- `packages/core` — Order, Product, AutomationRun, DeliveryRequest models
- `apps/api-server` — Event ingestion (`POST /events/*`), merchant auth, OpenAPI spec
- `packages/automation-engine` — Rule storage and no-op executor stub
- PostgreSQL schema migrations
- Unit tests for core models and API validation

**Exit criteria:** Send a synthetic `order.paid` event via curl; receive run ID and audit entry.

---

## Phase 2 — Lord TV vertical slice

**Focus:** First production use case on WooCommerce.

| Integration          | Package / app                                  |
| -------------------- | ---------------------------------------------- |
| WooCommerce events   | `apps/wordpress-plugin`                        |
| Payment verification | `provider-sdk` → AdfPay                        |
| IPTV provisioning    | `provider-sdk` → IPTV API (API-based delivery) |
| Customer email       | `notification-engine`                          |

- Automation rule: paid order → verify payment → provision subscription → send email
- Idempotency on order ID + retry with backoff
- Order note or meta update via connector callback (optional)

**Exit criteria:** Real WooCommerce test order completes full pipeline in staging.

---

## Phase 3 — Inventory-based delivery

**Focus:** Second delivery model for products without live APIs.

- `inventory-engine` — Import codes, reserve, commit, release
- Automation action: `allocate_from_inventory`
- Low-stock alerts via `notification-engine`
- Reconciliation report for depleted pools

**Exit criteria:** Product fulfilled from pre-loaded pool; API delivery and inventory delivery coexist in same automation engine.

---

## Phase 4 — Admin dashboard

**Focus:** Operator visibility without WordPress admin.

- `apps/admin-dashboard` — Auth, automation list, run history, failed run replay
- Connection management for providers (AdfPay, IPTV, email)
- Read-only Lord TV metrics (orders processed, failure rate)

**Exit criteria:** Operator diagnoses and replays a failed run from the dashboard.

---

## Phase 5 — Additional connectors

**Focus:** Prove connector pattern beyond WordPress.

| Connector | Priority | Notes                     |
| --------- | -------- | ------------------------- |
| Salla     | High     | Regional Saudi storefront |
| Zid       | High     | Regional Saudi storefront |
| Shopify   | Medium   | Global SaaS storefront    |

Each connector implements the same event contract documented in Phase 1. No changes to engines required for basic order-paid flows.

**Exit criteria:** One non-WooCommerce connector passes integration test suite against `api-server`.

---

## Risks and dependencies

| Risk                         | Mitigation                                             |
| ---------------------------- | ------------------------------------------------------ |
| IPTV API instability         | Retries, dead-letter queue, manual replay in dashboard |
| AdfPay webhook delays        | Poll payment status as fallback in automation step     |
| WordPress plugin maintenance | Keep plugin thin; versioned API contract               |
| Scope creep on dashboard     | Phase 4 limited to ops essentials before builder UI    |

## Document maintenance

Update this roadmap at the end of each phase. Record scope changes in [DECISIONS.md](DECISIONS.md).
