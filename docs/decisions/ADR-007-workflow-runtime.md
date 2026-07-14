# ADR-007: Workflow Runtime

**Status:** Accepted  
**Date:** 2026-07-14  
**Owner:** Osama AL-Sharif

## Context

The Order Processing Engine builds execution plans that describe what must happen to fulfill an order. Those plans include inventory reservation, provider resolution, and automation steps.

If order processing also executed those steps, orchestration and runtime concerns would be mixed. Retries, timeouts, cancellation, metrics, and history would be harder to test and evolve independently.

## Decision

### 1. Execution runtime is independent from order processing

Order Processing builds `ExecutionPlan` objects. The Workflow Runtime converts them into `WorkflowPlan` steps and executes them sequentially through injected step executors.

Order processing does not know how steps are retried, timed out, cancelled, or measured. The runtime does not embed WooCommerce, provider, or inventory business rules — it only orchestrates step execution.

### 2. Completed workflows are immutable

Once a workflow reaches `Succeeded`, its execution record cannot be mutated. This guarantees audit integrity and prevents accidental re-execution of fulfilled work.

`Failed` workflows may resume only when retry policy explicitly allows it. `Cancelled` workflows cannot continue.

### 3. Metrics are collected outside business logic

`WorkflowExecutionMetricsRecorder` tracks durations, retries, and completion counts independently from step executors. Business handlers return results; the runtime records timing and outcome metrics.

This separation keeps fulfillment logic simple and ensures consistent observability regardless of which step executor runs.

### 4. Runtime publishes workflow lifecycle events

The runtime emits:

- `WorkflowStarted`
- `WorkflowStepStarted`
- `WorkflowStepCompleted`
- `WorkflowStepFailed`
- `WorkflowCompleted`
- `WorkflowFailed`
- `WorkflowCancelled`

Downstream services can react without coupling to runtime internals.

## Consequences

- Order processing and workflow execution can evolve on separate release cycles.
- Unit tests can validate runtime policies with stub step executors and no network access.
- Future infrastructure adapters (queues, workers, databases) can wrap the runtime without changing domain contracts.
- Step business logic remains injectable and swappable per environment.

## Related components

- `packages/core/src/application/workflow/workflow-runtime.ts`
- `packages/core/src/domain/workflow/workflow-execution.ts`
- `packages/core/src/domain/workflow/workflow-execution-metrics.ts`
- `packages/core/src/application/workflow/execution-plan-workflow-adapter.ts`
