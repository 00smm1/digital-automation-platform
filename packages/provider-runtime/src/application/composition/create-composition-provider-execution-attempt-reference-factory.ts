import { randomUUID } from 'node:crypto';

import type { ProviderExecutionAttemptReference } from '../../domain/provider-references.js';
import type { ProviderExecutionAttemptReferenceFactory } from '../provider-execution-attempt-reference-factory.js';

export const createCompositionProviderExecutionAttemptReferenceFactory =
  (): ProviderExecutionAttemptReferenceFactory => ({
    create(): ProviderExecutionAttemptReference {
      return `attempt-${randomUUID()}` as ProviderExecutionAttemptReference;
    },
  });
