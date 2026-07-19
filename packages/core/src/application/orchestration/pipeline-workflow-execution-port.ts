import type { WorkflowExecutionPort } from './workflow-execution-port.js';
import type { WorkflowExecutionRequest } from '../../domain/orchestration/workflow-execution-request.js';
import { createWorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';
import type { WorkflowExecutionOutcome } from '../../domain/orchestration/workflow-execution-outcome.js';
import type { WorkflowDefinitionRepository } from '../../domain/workflow-pipeline/workflow-definition-repository.js';
import type { PipelineRunner } from '../workflow-pipeline/pipeline-runner.js';
import { mapWorkflowExecutionRequestToPipelineContext } from './workflow-execution-context-mapper.js';

export type PipelineWorkflowExecutionPortDependencies = {
  readonly pipelineRunner: PipelineRunner;
  readonly workflowDefinitionRepository: WorkflowDefinitionRepository;
};

/**
 * Workflow execution port adapter that runs declarative workflow pipelines.
 */
export class PipelineWorkflowExecutionPort implements WorkflowExecutionPort {
  private readonly pipelineRunner: PipelineRunner;
  private readonly workflowDefinitionRepository: WorkflowDefinitionRepository;

  constructor(dependencies: PipelineWorkflowExecutionPortDependencies) {
    this.pipelineRunner = dependencies.pipelineRunner;
    this.workflowDefinitionRepository = dependencies.workflowDefinitionRepository;
  }

  async execute(request: WorkflowExecutionRequest): Promise<WorkflowExecutionOutcome> {
    const definition = await this.workflowDefinitionRepository.findByReference(request.workflowId);

    if (definition === null) {
      return createWorkflowExecutionOutcome({
        executionId: request.executionId,
        automationId: request.automationId,
        workflowId: request.workflowId,
        status: 'failed',
        failureReason: `Workflow definition "${request.workflowId}" was not found.`,
      });
    }

    const context = mapWorkflowExecutionRequestToPipelineContext(request);
    const pipelineResult = await this.pipelineRunner.run(definition, context);

    return createWorkflowExecutionOutcome({
      executionId: request.executionId,
      automationId: request.automationId,
      workflowId: request.workflowId,
      status: pipelineResult.status === 'succeeded' ? 'succeeded' : 'failed',
      pipelineExecutionResult: pipelineResult,
      failureReason: pipelineResult.failureReason,
    });
  }
}
