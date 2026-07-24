import { WorkflowDefinition } from '../../../domain/workflow-pipeline/workflow-definition.js';
import { createPipelineStepDefinition } from '../../../domain/workflow-pipeline/pipeline-step-definition.js';
import { createIdentifier } from '../../../shared/types/identifier.js';
import {
  DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES,
  DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE,
} from '../../fulfillment/fulfillment-pipeline-step-types.js';

export const createDigitalProductFulfillmentWorkflowDefinition = (): WorkflowDefinition =>
  WorkflowDefinition.create({
    id: createIdentifier('WorkflowDefinition', DIGITAL_PRODUCT_FULFILLMENT_WORKFLOW_REFERENCE),
    name: 'Digital Product Fulfillment',
    steps: [
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'validate-order'),
        name: 'Validate Order',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.VALIDATE_ORDER,
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'reserve-inventory'),
        name: 'Reserve Inventory',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.RESERVE_INVENTORY,
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'provision-digital-product'),
        name: 'Provision Digital Product',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.PROVISION_DIGITAL_PRODUCT,
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'consume-reservation'),
        name: 'Consume Reservation',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.CONSUME_RESERVATION,
        payload: {},
      }),
      createPipelineStepDefinition({
        id: createIdentifier('PipelineStep', 'notify-customer'),
        name: 'Notify Customer',
        stepType: DIGITAL_FULFILLMENT_PIPELINE_STEP_TYPES.NOTIFY_CUSTOMER,
        payload: {},
      }),
    ],
  });
