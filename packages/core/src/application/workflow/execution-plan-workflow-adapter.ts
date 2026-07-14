import type { ExecutionPlan } from '../../domain/order/execution-plan.js';
import { createIdentifier } from '../../shared/types/identifier.js';
import {
  createWorkflowPlan,
  createWorkflowStepDefinition,
  type WorkflowPlan,
} from '../../domain/workflow/workflow-plan.js';

/**
 * Converts an order execution plan into a workflow plan for the runtime.
 */
export const createWorkflowPlanFromExecutionPlan = (plan: ExecutionPlan): WorkflowPlan => {
  return createWorkflowPlan({
    workflowId: plan.orderId,
    runId: plan.runId,
    sourcePlanId: plan.orderId,
    steps: plan.steps.map((step, index) =>
      createWorkflowStepDefinition({
        id: createIdentifier('WorkflowStep', `${plan.runId}:${index}`),
        name: step.type,
        stepType: step.type,
        payload: { ...step },
      }),
    ),
  });
};
