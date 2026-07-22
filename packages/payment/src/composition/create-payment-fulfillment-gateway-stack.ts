import {
  AutomationMatcher,
  createDigitalFulfillmentStack,
  ExecutionRunCoordinator,
  FakeClock,
  InboundEventGateway,
  InMemoryExecutionRunRepository,
  InMemoryIdempotencyStore,
  PipelineRunner,
  PipelineWorkflowExecutionPort,
  PlatformEventOrchestrator,
  createDigitalFulfillmentStepRegistry,
  type CreateDigitalFulfillmentStackOptions,
  type DigitalFulfillmentStack,
} from '@dap/core';

import { PaymentAuthorizationPolicy } from '../application/payment-authorization-policy.js';
import { PaymentConfirmationInboundAdapter } from '../application/payment-confirmation-inbound-adapter.js';
import { PaymentCorrelationService } from '../application/payment-correlation-service.js';
import { PaymentProcessingService } from '../application/payment-processing-service.js';
import {
  InMemoryOrderFulfillmentAuthorizationRegistry,
  InMemoryPaymentRepository,
} from '../domain/in-memory-payment-repository.js';
import {
  InMemoryCommerceOrderReadPort,
  type CommerceOrderReadPort,
} from '../application/commerce-order-read-port.js';
import { createCommerceOrderRecord } from '../domain/commerce-order-record.js';
import { createMoney } from '../domain/money.js';

export type PaymentFulfillmentGatewayStack = DigitalFulfillmentStack & {
  readonly clock: FakeClock;
  readonly executionRunRepository: InMemoryExecutionRunRepository;
  readonly executionRunCoordinator: ExecutionRunCoordinator;
  readonly idempotencyStore: InMemoryIdempotencyStore;
  readonly inboundGateway: InboundEventGateway;
  readonly paymentRepository: InMemoryPaymentRepository;
  readonly orderFulfillmentAuthorization: InMemoryOrderFulfillmentAuthorizationRegistry;
  readonly commerceOrderReadPort: InMemoryCommerceOrderReadPort;
  readonly paymentCorrelationService: PaymentCorrelationService;
  readonly paymentAuthorizationPolicy: PaymentAuthorizationPolicy;
  readonly paymentConfirmationInboundAdapter: PaymentConfirmationInboundAdapter;
  readonly paymentProcessingService: PaymentProcessingService;
};

export type CreatePaymentFulfillmentGatewayStackOptions = CreateDigitalFulfillmentStackOptions & {
  readonly clock?: FakeClock;
  readonly paymentGatewayAdapter: import('../application/ports/payment-gateway-adapter.js').PaymentGatewayAdapter;
  readonly commerceOrderReadPort?: CommerceOrderReadPort;
  readonly seedDefaultCommerceOrder?: boolean;
};

const seedDefaultCommerceOrders = (
  commerceOrderReadPort: InMemoryCommerceOrderReadPort,
  productReference: string,
): void => {
  for (const orderId of [
    '1001',
    '9001',
    '9101',
    '9201',
    '9202',
    '9301',
    '9401',
    '9501',
    '9601',
    '9701',
    '9801',
  ]) {
    commerceOrderReadPort.save(
      createCommerceOrderRecord({
        externalOrderReference: orderId,
        productReference,
        quantity: orderId === '9501' ? 2 : 1,
        customerReference: '4242',
        customerEmail: 'customer@example.com',
        expectedAmount: createMoney({ amountMinorUnits: 4900, currency: 'USD' }),
      }),
    );
  }
};

export const createPaymentFulfillmentGatewayStack = async (
  options: CreatePaymentFulfillmentGatewayStackOptions,
): Promise<PaymentFulfillmentGatewayStack> => {
  const clock = options.clock ?? new FakeClock();
  const productReference = options.productReference ?? '99001';
  const fulfillmentStack = await createDigitalFulfillmentStack({
    ...options,
    productReference,
  });
  const executionRunRepository = new InMemoryExecutionRunRepository();
  const executionRunCoordinator = new ExecutionRunCoordinator({
    repository: executionRunRepository,
    clock,
  });
  const idempotencyStore = new InMemoryIdempotencyStore();
  const paymentRepository = new InMemoryPaymentRepository();
  const orderFulfillmentAuthorization = new InMemoryOrderFulfillmentAuthorizationRegistry();
  const commerceOrderReadPort =
    options.commerceOrderReadPort instanceof InMemoryCommerceOrderReadPort
      ? options.commerceOrderReadPort
      : new InMemoryCommerceOrderReadPort();

  if (options.seedDefaultCommerceOrder !== false) {
    seedDefaultCommerceOrders(commerceOrderReadPort, productReference);
  }

  const paymentCorrelationService = new PaymentCorrelationService({ commerceOrderReadPort });
  const paymentAuthorizationPolicy = new PaymentAuthorizationPolicy();
  const paymentConfirmationInboundAdapter = new PaymentConfirmationInboundAdapter();

  const pipelineRunner = new PipelineRunner({
    stepExecutorRegistry: createDigitalFulfillmentStepRegistry({
      inventoryReservationPort: fulfillmentStack.inventoryReservationAdapter,
      provisioningPort: fulfillmentStack.provisioningAdapter,
      notificationPort: fulfillmentStack.notificationAdapter,
    }),
    progressObserver: executionRunCoordinator,
    clock,
  });

  const workflowExecutionPort = new PipelineWorkflowExecutionPort({
    pipelineRunner,
    workflowDefinitionRepository: fulfillmentStack.workflowDefinitionRepository,
  });
  const matcher = new AutomationMatcher({ repository: fulfillmentStack.automationRepository });
  const orchestrator = new PlatformEventOrchestrator({
    matcher,
    workflowExecutionPort,
    executionRunLifecyclePort: executionRunCoordinator,
  });
  const inboundGateway = new InboundEventGateway({
    idempotencyStore,
    orchestrator,
    executionRunCoordinator,
    workflowDefinitionRepository: fulfillmentStack.workflowDefinitionRepository,
    orderFulfillmentAuthorization,
  });
  const paymentProcessingService = new PaymentProcessingService({
    paymentGatewayAdapter: options.paymentGatewayAdapter,
    repository: paymentRepository,
    correlationService: paymentCorrelationService,
    authorizationPolicy: paymentAuthorizationPolicy,
    inboundGateway,
    inboundAdapter: paymentConfirmationInboundAdapter,
    clock,
  });

  return {
    ...fulfillmentStack,
    orchestrator,
    clock,
    executionRunRepository,
    executionRunCoordinator,
    idempotencyStore,
    inboundGateway,
    paymentRepository,
    orderFulfillmentAuthorization,
    commerceOrderReadPort,
    paymentCorrelationService,
    paymentAuthorizationPolicy,
    paymentConfirmationInboundAdapter,
    paymentProcessingService,
  };
};
