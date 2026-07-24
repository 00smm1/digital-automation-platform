import { createIdentifier } from '../shared/reference-validation.js';
import type { ProviderExecutionAttemptReference } from '../domain/provider-references.js';

export type ProviderExecutionAttemptReferenceFactory = {
  create(): ProviderExecutionAttemptReference;
};

export class DeterministicProviderExecutionAttemptReferenceFactory implements ProviderExecutionAttemptReferenceFactory {
  private sequence = 0;
  private readonly prefix: string;

  constructor(prefix = 'attempt') {
    this.prefix = prefix;
  }

  create(): ProviderExecutionAttemptReference {
    this.sequence += 1;
    return createIdentifier(
      'ProviderExecutionAttemptReference',
      `${this.prefix}-${this.sequence}`,
    ) as ProviderExecutionAttemptReference;
  }

  reset(): void {
    this.sequence = 0;
  }
}

export class SequentialProviderExecutionAttemptReferenceFactory implements ProviderExecutionAttemptReferenceFactory {
  private sequence = 0;
  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  create(): ProviderExecutionAttemptReference {
    this.sequence += 1;
    return createIdentifier(
      'ProviderExecutionAttemptReference',
      `${this.prefix}-${this.sequence}`,
    ) as ProviderExecutionAttemptReference;
  }
}
