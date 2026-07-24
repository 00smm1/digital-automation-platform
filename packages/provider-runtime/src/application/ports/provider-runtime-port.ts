import type { ProviderExecutionRequestInput } from '../provider-execution-request.js';
import type { ProviderRuntimeResult } from '../provider-runtime-result.js';

export type ProviderRuntimePort = {
  executeProvisioning(request: ProviderExecutionRequestInput): Promise<ProviderRuntimeResult>;
};
