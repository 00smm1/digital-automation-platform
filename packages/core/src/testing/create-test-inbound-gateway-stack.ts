import {
  createTestProviderRuntimeStack,
  FakeClock as ProviderRuntimeFakeClock,
  type FakeProviderAdapter,
} from '@dap/provider-runtime';
import { FakeClock } from '../shared/time/clock.js';
import {
  createInboundGatewayStack,
  type CreateInboundGatewayStackOptions,
  type InboundGatewayStack,
} from '../application/inbound-event/composition/create-inbound-gateway-stack.js';

export type { InboundGatewayStack, CreateInboundGatewayStackOptions };

export type TestInboundGatewayStack = InboundGatewayStack & {
  readonly fakeProviderAdapter: FakeProviderAdapter;
};

export const createTestInboundGatewayStack = async (
  options: CreateInboundGatewayStackOptions = {},
): Promise<TestInboundGatewayStack> => {
  const clock = options.clock ?? new FakeClock();
  const testProviderRuntime = createTestProviderRuntimeStack({
    clock: clock as unknown as ProviderRuntimeFakeClock,
  });

  const stack = await createInboundGatewayStack({
    ...options,
    clock,
    providerRuntimePort: testProviderRuntime.providerRuntime,
    fakeProviderAdapter: testProviderRuntime.fakeAdapter,
  });

  return {
    ...stack,
    fakeProviderAdapter: testProviderRuntime.fakeAdapter,
  };
};
