/**
 * Health signal returned by provider health checks.
 */
export type ProviderHealthStatus = {
  readonly providerId: string;
  readonly healthy: boolean;
  readonly checkedAt: Date;
  readonly message?: string;
};
