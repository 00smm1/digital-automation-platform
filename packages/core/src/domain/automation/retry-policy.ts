/**
 * Retry behavior applied to each automation step.
 */
export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly delayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  delayMs: 0,
};

export const createRetryPolicy = (
  policy: Partial<RetryPolicy> & Pick<RetryPolicy, 'maxAttempts'>,
): RetryPolicy => ({
  maxAttempts: policy.maxAttempts,
  delayMs: policy.delayMs ?? 0,
});
