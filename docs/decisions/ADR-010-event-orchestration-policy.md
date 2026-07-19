# ADR-010: Event-to-Workflow Orchestration Policy

**Status:** Accepted  
**Date:** 2026-07-19  
**Owner:** Osama AL-Sharif

## Context

Sprint 10 introduced automation definitions and deterministic rule matching. Normalized platform events can be matched to workflow references, but nothing connected matching to workflow execution.

Phase 2 requires an application orchestration path:

`NormalizedPlatformEvent` → `AutomationMatcher` → workflow execution → structured aggregate result

Constraints for Sprint 11:

- Provider-independent, in-memory only
- No HTTP, persistence, queues, or vendor adapters
- Preserve Clean Architecture boundaries and existing identifiers
- Prepare for future idempotency without claiming it is complete

## Decision

### 1. `PlatformEventOrchestrator` application service

Add `PlatformEventOrchestrator` in `@dap/core` application layer. It:

1. Accepts one `NormalizedPlatformEvent`
2. Delegates matching to `AutomationMatcher`
3. Builds one `WorkflowExecutionRequest` per match
4. Executes requests through a workflow execution port
5. Returns `PlatformEventOrchestrationResult`

The orchestrator does **not** evaluate rules directly, access repositories directly, mutate the incoming event, or instantiate infrastructure dependencies internally.

### 2. Workflow execution port (not direct `WorkflowRuntime` coupling)

Introduce `WorkflowExecutionPort`:

```typescript
execute(request: WorkflowExecutionRequest): Promise<WorkflowExecutionOutcome>
```

**Why not reuse `WorkflowRuntime` directly?**

`WorkflowRuntime` executes `WorkflowPlan` instances with step registries, policies, and lifecycle events. Orchestration needs a narrower contract: one matched automation, one event payload, one execution identity. A port keeps orchestration decoupled from workflow plan construction and allows a future adapter to translate requests into `WorkflowRuntime` invocations without changing orchestration policy.

### 3. Sequential execution in matcher order

When multiple automations match, execute them **sequentially** in the exact order returned by `AutomationMatcher` (priority descending, id ascending tie-break).

Rationale:

- Deterministic behavior for tests and audits
- Simple failure semantics (no race conditions)
- Easier future idempotency insertion per automation
- Safer preparation for durable persistence

Parallel execution is deferred until idempotency and persistence exist.

### 4. Continue-after-failure policy

A failed workflow execution does **not** prevent subsequent matched automations from running.

- Structured failure outcomes are collected for each attempt
- Infrastructure/runtime `Error` instances are converted to `WorkflowExecutionOutcome` failures
- Non-`Error` throws (programmer errors) propagate and are not silently converted
- Failed automation and workflow identities are preserved in outcomes
- Error messages must not include secrets or full event payloads

### 5. Structured aggregate result

`PlatformEventOrchestrationResult` includes:

| Field                      | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `eventId`, `eventType`     | Source event identity                        |
| `matchedAutomationCount`   | Matches from matcher                         |
| `attemptedExecutionCount`  | Executions attempted                         |
| `successfulExecutionCount` | Succeeded outcomes                           |
| `failedExecutionCount`     | Failed or cancelled outcomes                 |
| `executionOutcomes`        | Per-execution results in deterministic order |
| `overallStatus`            | Aggregate status                             |

**Overall status semantics:**

| Status               | Condition                              |
| -------------------- | -------------------------------------- |
| `noMatch`            | Zero matching automations              |
| `succeeded`          | One or more attempts and all succeeded |
| `partiallySucceeded` | Mixed successes and failures           |
| `failed`             | One or more attempts and all failed    |

### 6. Explicit execution identity

Each execution receives an explicit `WorkflowExecutionRequestId` from an injected `WorkflowExecutionIdGenerator`. Default format: `{eventId}:{automationId}:{sequence}`.

Random ID generation is not hidden inside domain entities. Tests inject deterministic generators.

`correlationId` follows existing convention: equals `eventId` for Sprint 11.

### 7. Idempotency insertion point (deferred)

Full idempotency storage is **not** implemented in Sprint 11.

Future deduplication should occur **before** the execution loop, using `(eventId, automationId)` as the deduplication key. Execution identity and event identity are kept explicit in requests and outcomes to support this without API changes.

### 8. In-memory workflow execution adapter

`InMemoryWorkflowExecutionPort` lives in application layer for tests and local composition:

- Records requests in order
- Configurable outcomes and exceptions
- No shared global state
- Returned history is cloned and immutable from caller perspective

## Consequences

- End-to-end in-memory test demonstrates event → match → workflow execution → aggregate result
- Production wiring adds a `WorkflowExecutionPort` adapter over `WorkflowRuntime` without changing orchestration policy
- Sequential continue-on-failure behavior is documented and testable
- Idempotency can be added as a decorator or pre-loop check in Sprint 12+

## Alternatives considered

| Alternative                              | Rejected because                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Direct `WorkflowRuntime` in orchestrator | Couples matching to workflow plan construction and step registry details       |
| Parallel multi-match execution           | Non-deterministic ordering under failure; harder idempotency                   |
| Fail-fast on first execution failure     | One automation failure would block unrelated automations for the same event    |
| Orchestrator evaluates rules directly    | Duplicates `AutomationMatcher` responsibility and breaks single responsibility |
| Publish orchestration lifecycle events   | No established consumer in Sprint 11; deferred to reduce scope                 |

## Future review triggers

Revisit this ADR when:

- Idempotency storage is introduced
- Persistence records orchestration runs
- Parallel execution is required for performance with proven safety
- `WorkflowRuntime` adapter semantics differ from port contract

## Non-goals (Sprint 11)

- HTTP event ingestion
- PostgreSQL / Redis
- Full idempotency implementation
- Orchestration lifecycle domain events
- Vendor-specific payload types
- Production `WorkflowRuntime` adapter

## Related components

- `packages/core/src/domain/orchestration/`
- `packages/core/src/application/orchestration/platform-event-orchestrator.ts`
- `packages/core/src/application/orchestration/workflow-execution-port.ts`
- `packages/core/src/application/orchestration/in-memory-workflow-execution-port.ts`
