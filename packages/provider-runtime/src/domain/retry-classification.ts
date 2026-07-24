export const RETRY_CLASSIFICATIONS = [
  'retry-not-safe',
  'retry-may-be-safe',
  'retry-after-reconciliation',
  'retry-not-applicable',
] as const;

export type RetryClassification = (typeof RETRY_CLASSIFICATIONS)[number];

export type TimeoutClassification = 'completed' | 'timed-out' | 'not-applicable';

/** Whether the remote provider outcome is known from this invocation. */
export type RemoteOutcomeClassification = 'unknown' | 'confirmed-success' | 'confirmed-failure';
