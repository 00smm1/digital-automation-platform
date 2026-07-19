# ADR-012: First Digital Fulfillment Vertical Slice

**Status:** Accepted  
**Date:** 2026-07-19  
**Owner:** Osama AL-Sharif

## Context

Sprints 10–12 delivered automation matching, event orchestration, and declarative workflow pipelines as separate in-memory capabilities. Phase 2 exit criteria require proving that a normalized order event can traverse the platform and produce a deterministic fulfillment result entirely in memory.

No HTTP ingress, commerce connectors, payment verification, or real provider APIs exist yet. The first vertical slice must validate architecture composition without external dependencies.

## Decision

### 1. Digital fulfillment application use case

Add `DigitalFulfillmentService` in `@dap/core` application layer. It:

1. Validates a provider-neutral `DigitalFulfillmentRequest`
2. Maps the request to a `NormalizedPlatformEvent`
3. Delegates to `PlatformEventOrchestrator` (matcher → workflow execution port)
4. Maps orchestration outcomes to a structured `DigitalFulfillmentResult`

The use case does not bypass orchestration or the pipeline runner.

### 2. Workflow execution through pipeline adapter

Add `PipelineWorkflowExecutionPort` implementing `WorkflowExecutionPort`:

- Resolves `WorkflowDefinition` by `workflowReference` via `WorkflowDefinitionRepository`
- Maps `WorkflowExecutionRequest` to `PipelineStepExecutionContext`
- Executes through `PipelineRunner`
- Returns `WorkflowExecutionOutcome` including `pipelineExecutionResult`

This connects Sprint 11 orchestration to Sprint 12 pipelines without coupling the orchestrator to pipeline internals.

### 3. Vertical slice pipeline steps

Standard digital fulfillment workflow (`digital-product-fulfillment`):

| Step                      | Type                        | Responsibility             |
| ------------------------- | --------------------------- | -------------------------- |
| Validate Order            | `validate-order`            | Request validation         |
| Reserve Inventory         | `reserve-inventory`         | Inventory reservation port |
| Provision Digital Product | `provision-digital-product` | Provisioning port          |
| Notify Customer           | `notify-customer`           | Notification port          |

Step business logic lives in step executors behind application ports — not in the pipeline runner.

### 4. Application ports and fake adapters

| Port                             | Adapter                                 | Reuse                             |
| -------------------------------- | --------------------------------------- | --------------------------------- |
| `InventoryReservationPort`       | `InventoryReservationAdapter`           | Wraps existing `InventoryService` |
| `DigitalProductProvisioningPort` | `FakeDigitalProductProvisioningAdapter` | New fake adapter                  |
| `CustomerNotificationPort`       | `InMemoryCustomerNotificationAdapter`   | New in-memory adapter             |
| `WorkflowExecutionPort`          | `PipelineWorkflowExecutionPort`         | New pipeline adapter              |

Notification and provisioning domain contracts are added to `@dap/core`. Delivery implementations remain deferred to engine packages.

### 5. Failure semantics

| Failure             | Inventory     | Provisioning  | Notification  | Status     |
| ------------------- | ------------- | ------------- | ------------- | ---------- |
| Validation          | not attempted | not attempted | not attempted | `rejected` |
| No automation match | not attempted | not attempted | not attempted | `failed`   |
| Inventory           | failed        | not attempted | not attempted | `failed`   |
| Provisioning        | preserved     | failed        | not attempted | `failed`   |
| Notification        | preserved     | preserved     | failed        | `failed`   |

**Compensation deferred:** inventory reservations are not released on downstream failure in Sprint 13.

**Secrets:** provisioning delivery payloads are sensitive. Error messages must not include secrets. `formatProvisioningDeliveryForDisplay` redacts secrets in notification body formatting.

### 6. Pipeline context enrichment

`PipelineStepExecutionContext` gains `priorStepOutputs` so sequential steps can read prior step results immutably. `PipelineRunner` passes accumulated outputs to each subsequent step.

### 7. In-memory composition root

`createDigitalFulfillmentStack()` wires the full vertical slice for tests:

event → matcher → orchestrator → pipeline port → pipeline runner → step executors → ports → adapters

No production DI framework is introduced.

### 8. Package placement

All Sprint 13 code lives in `@dap/core` per ADR-008. Engine packages remain stubs until Phase 3 adapters are implemented. No new package was required.

## Consequences

- Phase 2 in-memory vertical slice is proven with 12+ fulfillment tests
- Future WooCommerce, payment, and provider integrations replace fake adapters without changing orchestration policy
- Two execution paths remain (`OrderProcessingService` vs fulfillment pipeline) until unified in a later sprint
- Reservation compensation and idempotency remain documented gaps

## Alternatives considered

| Alternative                                 | Rejected because                                              |
| ------------------------------------------- | ------------------------------------------------------------- |
| Bypass orchestrator, call pipeline directly | Does not prove platform composition                           |
| Use `OrderProcessingService` only           | Does not use workflow definitions/pipeline from Sprints 11–12 |
| Real HTTP provider/email adapters           | Out of Sprint 13 scope                                        |
| Release inventory on provisioning failure   | Compensation workflow deferred                                |
| New `@dap/fulfillment-engine` package       | ADR-008: contracts belong in core first                       |

## Non-goals (Sprint 13)

- WooCommerce, AdfPay, IPTV, real email/SMS
- HTTP, database, Redis, queues
- Compensation workflows
- Idempotency persistence
- Production engine package implementations

## Future review triggers

Revisit when:

- Real provider adapters replace fake provisioning port
- Notification delivery moves to `notification-engine`
- Order processing path merges with fulfillment pipeline
- Reservation compensation is required

## Related components

- `packages/core/src/application/fulfillment/`
- `packages/core/src/application/orchestration/pipeline-workflow-execution-port.ts`
- `packages/core/src/application/workflow-pipeline/steps/`
- `packages/core/src/domain/fulfillment/`
- `packages/core/src/domain/notification/`
- `packages/core/src/domain/provisioning/`
