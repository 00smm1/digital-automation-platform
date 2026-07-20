export type {
  InboundEventAdapter,
  InboundEventNormalizationResult,
} from './inbound-event-adapter.js';
export { InboundEventGateway } from './inbound-event-gateway.js';
export type { InboundEventGatewayDependencies } from './inbound-event-gateway.dependencies.js';
export {
  FakeInboundEventAdapter,
  createValidExternalOrderPaidEnvelope,
} from './fake-inbound-event-adapter.js';
export type { FakeInboundEventAdapterOptions } from './fake-inbound-event-adapter.js';
export {
  createInboundGatewayStack,
  type InboundGatewayStack,
  type CreateInboundGatewayStackOptions,
} from './composition/create-inbound-gateway-stack.js';
