# ADR-009: Automation Definitions and Rule Matching

**Status:** Accepted  
**Date:** 2026-07-19  
**Owner:** Osama AL-Sharif

## Context

Phase 2 requires the platform to describe automations triggered by normalized platform events and select workflows through deterministic rule matching — before any HTTP ingress, persistence, or vendor adapters exist.

Order processing and workflow runtime already exist, but nothing maps inbound events such as `order.paid` to workflow references like `lord-tv-premium-delivery`.

## Decision

### 1. Automation definitions live in `@dap/core`

Provider-independent models are added under `domain/automation-definition/`:

- `AutomationDefinition` aggregate
- `AutomationTrigger`, `AutomationCondition`, `ConditionGroup`
- `NormalizedPlatformEvent` envelope for matcher input
- `RuleEvaluator` pure domain service
- `AutomationDefinitionRepository` contract with in-memory implementation

### 2. Matching is separate from execution

`AutomationMatcher` (application layer) loads definitions, filters by trigger and conditions, and returns matches in priority order. It does **not** execute workflows, publish events, or access network resources.

### 3. Deterministic rule semantics

- Trigger matching uses exact normalized `eventType` equality.
- Field paths use dot notation (e.g. `product.type`); missing paths resolve to `undefined` without throwing.
- Numeric comparisons require finite numbers on both sides; no implicit string-to-number coercion.
- `contains` supports strings (substring) and arrays (element match via `Object.is`).
- `in` requires `expectedValue` to be an array; passes when the resolved field value equals any element (`Object.is`).
- Empty condition groups always pass (automation matches on trigger alone).
- **Priority:** higher numeric values rank first (e.g. priority `100` beats priority `10`); ties break by ascending automation id.

| Operator             | Semantics                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `equals`             | `Object.is(actual, expected)`                                          |
| `notEquals`          | not `Object.is(actual, expected)`                                      |
| `exists`             | resolved value is not `undefined`                                      |
| `notExists`          | resolved value is `undefined`                                          |
| `greaterThan`        | both values are finite numbers; actual > expected                      |
| `greaterThanOrEqual` | both values are finite numbers; actual >= expected                     |
| `lessThan`           | both values are finite numbers; actual < expected                      |
| `lessThanOrEqual`    | both values are finite numbers; actual <= expected                     |
| `contains`           | string includes substring, or array contains element equal to expected |
| `in`                 | expected is array; actual equals any element                           |

## Consequences

- Phase 2 can wire matcher output to order processing / workflow runtime in a later sprint.
- Unit tests validate rule semantics without external integrations.
- Engine packages can compose matcher and repository without redefining models.

## Non-goals (Sprint 10)

- Nested condition groups
- Workflow execution
- Event ingestion HTTP endpoints
- Persistence beyond in-memory repository
- WooCommerce, AdfPay, IPTV, or vendor-specific payload types

## Related components

- `packages/core/src/domain/automation-definition/`
- `packages/core/src/application/automation-definition/automation-matcher.ts`
