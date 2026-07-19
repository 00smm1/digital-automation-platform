# ADR-011: Workflow Execution Pipeline Policy

**Status:** Accepted  
**Date:** 2026-07-19  
**Owner:** Osama AL-Sharif

## Context

Sprint 11 connected normalized platform events to workflow execution through `WorkflowExecutionPort`, but workflows were referenced only by string identifiers. There was no provider-independent model for describing a workflow as an ordered sequence of deterministic steps, nor a dedicated pipeline runner with explicit failure semantics.

Sprint 8 introduced `WorkflowRuntime` with lifecycle events, retry policies, timeouts, and aggregate state. Sprint 4 introduced `AutomationPipeline` with automation-specific context. Phase 2 still needs a simpler, declarative pipeline layer that transforms workflow definitions into sequential step execution without infrastructure dependencies.

## Decision

### 1. Workflow definitions live in `@dap/core`

Add provider-independent models under `domain/workflow-pipeline/`:

- `WorkflowDefinition` — declarative ordered workflow
- `PipelineStepDefinition` — step id, name, type, payload
- `PipelineStepExecutionContext` — immutable runtime context
- `PipelineStepExecutionResult` — per-step outcome with duration
- `PipelineExecutionResult` — aggregate outcome with completed steps, failed step, duration
- `PipelineStep` — step implementation contract

Empty workflow definitions are valid (zero steps).

### 2. Pipeline execution is separate from workflow runtime lifecycle

`PipelineRunner` (application layer) executes `WorkflowDefinition` instances sequentially through a `PipelineStepExecutorRegistry`.

This is intentionally simpler than `WorkflowRuntime`:

- No workflow aggregate state machine
- No retry/timeout/cancellation policies in Sprint 12
- No lifecycle event publishing
- Focus on deterministic step ordering and fatal failure propagation

`WorkflowRuntime` remains the execution engine for durable runs with policies. Future sprints may adapt `WorkflowDefinition` into `WorkflowPlan` or bridge through `WorkflowExecutionPort`.

### 3. Sequential execution with fatal failure stop

Steps execute in definition order, one at a time.

When a step returns `status: 'failed'` or throws an operational `Error`:

- Pipeline stops immediately
- Previously completed steps are preserved in `completedSteps`
- `failedStep` identifies the failing step
- Subsequent steps are not attempted

Non-`Error` throws propagate (programmer errors).

### 4. Immutable execution context

Each pipeline run receives a `PipelineStepExecutionContext` cloned at creation. Step executors must not mutate shared runner state. The runner does not mutate the incoming context.

### 5. In-memory step executor registry

`InMemoryPipelineStepExecutorRegistry` registers executors by `stepType` for tests and local composition:

- No shared global state between instances
- Deterministic helper executors for tests
- Optional `registerStep(PipelineStep)` for class-based step implementations

### 6. Aggregate result semantics

| Status      | Condition                                   |
| ----------- | ------------------------------------------- |
| `empty`     | Zero steps defined and executed             |
| `succeeded` | One or more steps and all succeeded         |
| `failed`    | A step failed or threw an operational error |

Results include `durationMs`, ordered `completedSteps`, and optional `failedStep`.

## Consequences

- Workflows can be defined and tested as ordered pipelines without HTTP, database, or vendor adapters
- Sprint 13+ can map `workflowReference` strings to `WorkflowDefinition` instances
- `WorkflowExecutionPort` adapters can delegate to `PipelineRunner` before full `WorkflowRuntime` integration
- Two execution paths coexist (`PipelineRunner` vs `WorkflowRuntime`) until unified by a later ADR

## Alternatives considered

| Alternative                              | Rejected because                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Reuse `AutomationPipeline` directly      | Tied to automation context and requires non-empty steps                 |
| Extend `WorkflowRuntime` for definitions | Mixes lifecycle/policy concerns with declarative definition execution   |
| Continue-on-failure like orchestrator    | Pipeline semantics require stop-on-fatal-failure for fulfillment safety |
| Parallel step execution                  | Non-deterministic ordering; deferred until idempotency exists           |

## Non-goals (Sprint 12)

- HTTP, database, Redis, queues, email, external APIs
- Vendor-specific step models
- Workflow persistence
- Idempotency storage
- Wiring to `PlatformEventOrchestrator` or `WorkflowExecutionPort`

## Future review triggers

Revisit when:

- `WorkflowExecutionPort` production adapter is implemented
- `WorkflowDefinition` → `WorkflowPlan` mapping is required
- Retry/timeout policies must apply at pipeline level
- Parallel or compensating step execution is needed

## Related components

- `packages/core/src/domain/workflow-pipeline/`
- `packages/core/src/application/workflow-pipeline/pipeline-runner.ts`
- `packages/core/src/application/workflow-pipeline/in-memory-pipeline-step-executor-registry.ts`
