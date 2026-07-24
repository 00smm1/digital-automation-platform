import {
  createTestProviderRuntimeStack,
  FakeClock as ProviderRuntimeFakeClock,
  type FakeProviderAdapter,
} from '@dap/provider-runtime';
import { FakeClock } from '../shared/time/clock.js';
import {
  createDigitalFulfillmentStack,
  type CreateDigitalFulfillmentStackOptions,
  type DigitalFulfillmentStack,
} from '../application/fulfillment/composition/create-digital-fulfillment-stack.js';

export type TestDigitalFulfillmentStack = DigitalFulfillmentStack & {
  readonly fakeProviderAdapter: FakeProviderAdapter;
};

export const createTestDigitalFulfillmentStack = async (
  options: CreateDigitalFulfillmentStackOptions = {},
): Promise<TestDigitalFulfillmentStack> => {
  const clock = options.clock ?? new FakeClock();
  const testProviderRuntime = createTestProviderRuntimeStack({
    clock: clock as unknown as ProviderRuntimeFakeClock,
  });

  const stack = await createDigitalFulfillmentStack({
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
