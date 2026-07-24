import {
  createTestProviderRuntimeStack,
  FakeClock,
  type FakeProviderAdapter,
  type FakeProviderAdapterMode,
  type TestProviderRuntimeStack,
} from '@dap/provider-runtime';

export const createWorkflowTestProviderRuntime = (options?: {
  readonly clock?: FakeClock;
  readonly adapterMode?: FakeProviderAdapterMode;
  readonly configuredException?: Error;
}): TestProviderRuntimeStack & { readonly fakeAdapter: FakeProviderAdapter } => {
  const stack = createTestProviderRuntimeStack({
    clock: options?.clock,
  });

  if (options?.adapterMode !== undefined) {
    stack.fakeAdapter.setMode(options.adapterMode);
  }

  if (options?.configuredException !== undefined) {
    stack.fakeAdapter.setConfiguredException(options.configuredException);
  }

  return stack;
};

export { FakeClock as ProviderRuntimeFakeClock };
