import { InMemoryIdempotencyStore } from '../../../domain/inbound-event/in-memory-idempotency-store.js';
import { InboundEventGateway } from '../inbound-event-gateway.js';
import { FakeInboundEventAdapter } from '../fake-inbound-event-adapter.js';
import {
  createDigitalFulfillmentStack,
  type DigitalFulfillmentStack,
} from '../../fulfillment/composition/create-digital-fulfillment-stack.js';

export type InboundGatewayStack = DigitalFulfillmentStack & {
  readonly idempotencyStore: InMemoryIdempotencyStore;
  readonly inboundGateway: InboundEventGateway;
  readonly inboundAdapter: FakeInboundEventAdapter;
};

export type CreateInboundGatewayStackOptions = Parameters<typeof createDigitalFulfillmentStack>[0];

export const createInboundGatewayStack = async (
  options: CreateInboundGatewayStackOptions = {},
): Promise<InboundGatewayStack> => {
  const fulfillmentStack = await createDigitalFulfillmentStack(options);
  const idempotencyStore = new InMemoryIdempotencyStore();
  const inboundAdapter = new FakeInboundEventAdapter();
  const inboundGateway = new InboundEventGateway({
    idempotencyStore,
    orchestrator: fulfillmentStack.orchestrator,
  });

  return {
    ...fulfillmentStack,
    idempotencyStore,
    inboundGateway,
    inboundAdapter,
  };
};
