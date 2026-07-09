# Architecture Decisions

Recorded decisions for the Digital Automation Platform.  
**Owner:** Osama AL-Sharif

Format: **Context → Decision → Consequences**

---

## ADR-001: Platform core is independent from WordPress

**Context:** Initial storefront is WooCommerce on WordPress. Temptation exists to implement automation in PHP plugins for speed.

**Decision:** All orchestration, provider integration, and notification logic lives in the platform (`api-server` + packages). WordPress is not a runtime dependency of the core.

**Consequences:**

- Platform can be developed, tested, and deployed without WordPress
- WooCommerce plugin remains a thin connector (~events + settings + API client)
- Future connectors (Salla, Zid, Shopify) reuse the same core without WordPress code paths

---

## ADR-002: WordPress is a connector, not the platform

**Context:** WooCommerce is the first channel for Lord TV.

**Decision:** `apps/wordpress-plugin` is classified as a **connector** — same architectural role as future Salla, Zid, and Shopify integrations.

**Consequences:**

- Connector contract (events, auth, config) is designed for multiple channels from day one
- No WordPress-specific types in `packages/core`
- Connector versioning is separate from platform API versioning

---

## ADR-003: Multi-connector roadmap

**Context:** Lord TV uses WooCommerce today; business may expand to regional and global platforms.

**Decision:** Plan first-class connectors for **Salla**, **Zid**, and **Shopify** after the WordPress vertical slice is proven.

**Consequences:**

- Event schema in `core` must be commerce-agnostic (no WooCommerce field names in canonical models)
- `provider-sdk` separates **storefront connectors** from **fulfillment providers** (payment, IPTV, email)
- Connector implementation is phased (Phase 5); not built in Sprint 0

---

## ADR-004: Two delivery models — API and inventory

**Context:** Digital products may be provisioned live (IPTV API) or from pre-purchased stock (license keys).

**Decision:** Platform supports **API-based delivery** and **inventory-based delivery** as distinct automation actions, both first-class.

**Consequences:**

- `automation-engine` actions include `provision_via_api` and `allocate_from_inventory`
- `inventory-engine` owns pool management; not duplicated in connectors
- Lord TV Phase 2 uses API delivery; inventory delivery follows in Phase 3

---

## ADR-005: Lord TV as reference implementation

**Context:** Need a concrete end-to-end scenario to validate architecture.

**Decision:** First production use case is **Lord TV**: WooCommerce checkout, **AdfPay** payment, **IPTV provider API** provisioning, **email** customer delivery.

**Consequences:**

- Phase 2 roadmap is scoped to this stack; avoids abstract integration work without a customer
- `provider-sdk` initial adapters: AdfPay, IPTV API, email SMTP/API
- Success metrics tied to Lord TV order completion rate and audit completeness

---

## ADR-006: Monorepo with engine separation

**Context:** Multiple deployable apps and shared libraries; need clear boundaries.

**Decision:** Single monorepo with `apps/` (deployables) and `packages/` (engines + SDK). Engines do not depend on apps.

**Consequences:**

- Shared versioning and atomic changes across API and engines
- `automation-engine`, `inventory-engine`, and `notification-engine` remain independently testable
- CI can run targeted tests per package

---

## ADR-007: Provider abstraction via provider-sdk

**Context:** Many external systems (payments, IPTV, email, future WMS).

**Decision:** All vendor-specific HTTP clients and adapters live in `packages/provider-sdk` behind stable interfaces.

**Consequences:**

- Automation rules reference provider types, not vendor SDKs
- Swapping email or payment provider affects SDK only
- Mock providers enable integration tests without external calls

---

## ADR-008: Notifications are a dedicated engine

**Context:** Email, SMS, and webhooks share queuing and templating concerns.

**Decision:** `notification-engine` handles all outbound customer and operator messages; automations invoke it as an action.

**Consequences:**

- Templates and delivery logs centralized
- Lord TV credential email is one template + one engine call
- Future channels (SMS, Slack) extend the engine, not individual automations

---

## Pending decisions

| Topic | Options under consideration | Target |
|-------|----------------------------|--------|
| API style | REST vs GraphQL for `api-server` | Phase 1 |
| Queue backend | Redis vs managed queue service | Phase 1 |
| WordPress plugin distribution | WP.org vs private zip | Phase 2 |
| Multi-tenancy model | Single DB + tenant ID vs schema per merchant | Phase 4 |

Add new ADRs below as decisions are made. Do not delete superseded entries — mark them **Superseded by ADR-NNN**.
