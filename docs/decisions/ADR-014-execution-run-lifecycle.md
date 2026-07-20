# ADR-014: Execution Run Lifecycle and Audit Trail Contracts

**Status:** Accepted  
**Date:** 2026-07-20  
**Owner:** Osama AL-Sharif

## Context

Sprint 14 introduced inbound event gateway and idempotency contracts. Accepted events traverse automation matching, workflow orchestration, and pipeline execution, but the platform lacked a provider-neutral record of run progress and final outcomes suitable for support investigation, future dashboards, and API responses.

Persistence, distributed tracing, and operator dashboards are deferred. Sprint 15 defines in-memory execution-run lifecycle and safe audit read models without bypassing existing orchestration boundaries.

## Decision

### 1. Execution run aggregate

Add `ExecutionRun` in `@dap/core` domain with:

| Field                                              | Purpose                                                  |
| -------------------------------------------------- | -------------------------------------------------------- |
| `id` (`ExecutionRunId`)                            | Stable run identity aligned with inbound idempotency key |
| `sourceId`, `externalEventId`, `normalizedEventId` | Correlation references                                   |
| `idempotencyKey`                                   | Link to gateway deduplication                            |
| `externalOrderReference`                           | Safe extracted order reference when available            |
| `status`                                           | Lifecycle state                                          |
| `createdAt`, `startedAt`, `completedAt`            | Timestamps via injectable `Clock`                        |
| `matchedAutomationIds`, `workflowIds`              | Matched automation references                            |
| `pipelineExecutionId`                              | Workflow execution correlation                           |
| `stepProgress`                                     | Ordered step records                                     |
| `failureCode`, `failureReason`                     | Safe terminal failure information                        |
| `outcomeSummary`                                   | Safe aggregate orchestration summary                     |

Raw external payloads, credentials, authorization headers, webhook signatures, and provisioning secrets are never stored.

### 2. Lifecycle states and transitions

| Status       | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `received`   | Run created after successful idempotency claim                     |
| `processing` | Business execution started                                         |
| `completed`  | Successful or non-rejected terminal processing                     |
| `rejected`   | Business validation rejection (not infrastructure crash)           |
| `failed`     | Runtime, adapter, inventory, provisioning, or notification failure |

Valid transitions:

```text
received → processing
received → rejected
processing → completed
processing → failed
processing → rejected
```

Terminal states (`completed`, `rejected`, `failed`) cannot transition back to `processing`. Invalid transitions return typed `ExecutionRunLifecycleError`.

### 3. Correlation strategy

- **Run identity:** `ExecutionRunId` derived from inbound `IdempotencyKey` (`sourceId:externalEventId`)
- **Workflow execution:** optional `executionRunId` on `WorkflowExecutionRequest`, propagated through pipeline context metadata
- **Pipeline execution:** existing `executionId` preserved on pipeline results
- **Order reference:** extracted from normalized payload `order.id` when present

One execution run is created per accepted inbound event. Duplicate inbound submissions reuse the existing run via idempotency correlation without creating a second record.

### 4. Repository port and in-memory implementation

Add `ExecutionRunRepository` with:

- `create`
- `findById`
- `findByIdempotencyKey`
- `save`

`InMemoryExecutionRunRepository` provides deterministic duplicate protection and returns immutable copies on read. Persistence replacement is possible without changing application behavior.

### 5. Lifecycle coordinator and observer ports

Add `ExecutionRunCoordinator` application service implementing:

- `ExecutionRunLifecyclePort` — records matched automations before workflow execution
- `PipelineExecutionProgressObserver` — records step started/completed/failed/skipped progress during pipeline execution

Integration points:

| Component                   | Hook                                                   |
| --------------------------- | ------------------------------------------------------ |
| `InboundEventGateway`       | create run, start processing, finalize/reject/fail run |
| `PlatformEventOrchestrator` | optional lifecycle port for matched automations        |
| `PipelineRunner`            | optional progress observer (not hard-coded repository) |

The pipeline runner depends only on the observer port contract, not on repository implementations.

### 6. Step progress strategy

Step records use statuses: `pending`, `running`, `completed`, `failed`, `skipped`.

Progress is recorded as steps actually execute through the observer. After fatal pipeline failure, remaining workflow definition steps are marked `skipped` during finalization — reflecting real pipeline fatal-stop semantics without fabricating intermediate running states.

Step outcome metadata is sanitized before storage (`secret`, `password`, `token`, etc. redacted).

### 7. Audit read model

Add `ExecutionRunAuditRecord` — safe application-facing projection exposing run ID, correlation references, status, matched automations, workflows, step summaries, timestamps, and safe failure information. No raw payloads or secrets.

### 8. Repository consistency policy

| Event                               | Policy                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Normalization failure               | No run created                                                                      |
| Idempotency claim success           | Exactly one run created                                                             |
| Run creation failure                | Orchestration does not start; idempotency marked failed                             |
| Progress/finalization write failure | Processing terminates with typed lifecycle failure; run marked failed when possible |
| Duplicate inbound event             | No second run; existing run returned via idempotency lookup                         |

Audit write failures are not silently ignored. Pipeline progress observer failures throw `ExecutionRunLifecycleError`, aborting orchestration and returning a controlled gateway failure.

### 9. Sensitive-data exclusion policy

- No raw external payloads in run records or audit projections
- No credentials, tokens, signatures, or authorization metadata
- Provisioning secrets redacted in stored step metadata
- Unexpected exception messages sanitized in audit outputs and gateway failures

### 10. Relationship with idempotency

| Layer                     | Key                        | Purpose                            |
| ------------------------- | -------------------------- | ---------------------------------- |
| Idempotency (Sprint 14)   | `sourceId:externalEventId` | Prevent duplicate orchestration    |
| Execution run (Sprint 15) | same composite as run ID   | Audit trail and lifecycle tracking |

Idempotency governs whether business execution runs. Execution runs govern how that single accepted execution is observed and queried.

## Consequences

**Positive**

- Safe audit records ready for future admin dashboard and API consumption
- Step-level visibility without exposing sensitive payloads
- Deterministic in-memory lifecycle suitable for end-to-end tests with `FakeClock`
- Clear extension point for PostgreSQL-backed run repository in Phase 4

**Negative / deferred**

- In-memory runs lost on process restart
- No run replay, resume, or compensation
- No distributed tracing or observability vendor integration
- No orchestration-level `(eventId, automationId)` deduplication yet (ADR-010)

## Future consumption

Future `apps/api-server` and `apps/admin-dashboard` will query `ExecutionRunAuditRecord` projections through application services. HTTP ingress, persistence, and dashboards remain deferred.

## Related decisions

- [ADR-010](ADR-010-event-orchestration-policy.md) — orchestration policy and future per-automation dedup
- [ADR-013](ADR-013-inbound-event-gateway.md) — inbound gateway and idempotency contracts
