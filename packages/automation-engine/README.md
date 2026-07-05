# Automation Engine

Workflow orchestration and rule execution for digital commerce.

## Purpose

Define, schedule, and run automations triggered by commerce events — order placed, payment captured, stock threshold, customer segment change, and more.

## Planned responsibilities

- Workflow definition schema (triggers, conditions, actions, branches)
- Event ingestion and deduplication
- Step execution with retries, timeouts, and compensation
- Integration with `inventory-engine` and `notification-engine` as action targets
- Execution history and dead-letter handling

## Dependencies

- `packages/core` — domain models and event contracts
- `packages/provider-sdk` — external actions (e.g. update CRM, tag customer)

## Status

Structure only — no engine code yet.
