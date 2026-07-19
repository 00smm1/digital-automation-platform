import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import {
  createPlatformEventOrchestrationResult,
  type PlatformEventOrchestrationResult,
} from '../../domain/orchestration/platform-event-orchestration-result.js';
import {
  createDefaultWorkflowExecutionIdGenerator,
  createWorkflowExecutionRequest,
  type WorkflowExecutionIdGenerator,
} from '../../domain/orchestration/workflow-execution-request.js';
import type { WorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';
import { createWorkflowExecutionOutcomeFromError } from '../../domain/orchestration/workflow-execution-outcome.js';
import type { PlatformEventOrchestratorDependencies } from './platform-event-orchestrator.dependencies.js';

const isOperationalExecutionError = (error: unknown): boolean => {
  return error instanceof Error;
};

/**
 * Orchestrates normalized platform events from matching through workflow execution.
 *
 * Sequential execution preserves deterministic ordering from AutomationMatcher.
 * Failed executions do not prevent subsequent matched automations from running.
 *
 * Future idempotency checks should occur before workflow execution using eventId
 * and automationId as the deduplication key.
 */
export class PlatformEventOrchestrator {
  private readonly matcher: PlatformEventOrchestratorDependencies['matcher'];
  private readonly workflowExecutionPort: PlatformEventOrchestratorDependencies['workflowExecutionPort'];
  private readonly executionIdGenerator: WorkflowExecutionIdGenerator;

  constructor(dependencies: PlatformEventOrchestratorDependencies) {
    this.matcher = dependencies.matcher;
    this.workflowExecutionPort = dependencies.workflowExecutionPort;
    this.executionIdGenerator =
      dependencies.executionIdGenerator ?? createDefaultWorkflowExecutionIdGenerator();
  }

  async process(event: NormalizedPlatformEvent): Promise<PlatformEventOrchestrationResult> {
    const matchedAutomations = await this.matcher.match(event);

    if (matchedAutomations.length === 0) {
      return createPlatformEventOrchestrationResult({
        eventId: event.eventId,
        eventType: event.eventType,
        matchedAutomationCount: 0,
        executionOutcomes: [],
      });
    }

    const executionOutcomes: WorkflowExecutionOutcome[] = [];

    for (let sequence = 0; sequence < matchedAutomations.length; sequence += 1) {
      const definition = matchedAutomations[sequence]!;

      const request = createWorkflowExecutionRequest({
        executionId: this.executionIdGenerator({
          eventId: event.eventId,
          automationId: definition.id,
          sequence,
        }),
        eventId: event.eventId,
        automationId: definition.id,
        workflowId: definition.workflowReference,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        correlationId: event.eventId,
        payload: event.payload,
      });

      try {
        const outcome = await this.workflowExecutionPort.execute(request);
        executionOutcomes.push(outcome);
      } catch (error: unknown) {
        if (!isOperationalExecutionError(error)) {
          throw error;
        }

        executionOutcomes.push(
          createWorkflowExecutionOutcomeFromError({
            executionId: request.executionId,
            automationId: request.automationId,
            workflowId: request.workflowId,
            error,
          }),
        );
      }
    }

    return createPlatformEventOrchestrationResult({
      eventId: event.eventId,
      eventType: event.eventType,
      matchedAutomationCount: matchedAutomations.length,
      executionOutcomes,
    });
  }
}
