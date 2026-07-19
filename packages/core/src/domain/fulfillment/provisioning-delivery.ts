const REDACTED_SECRET = '[REDACTED]';

/**
 * Sensitive digital product delivery payload.
 *
 * Secrets must not appear in error messages or default string representations.
 */
export type ProvisioningDelivery = {
  readonly accountReference: string;
  readonly secret: string;
  readonly activationInstructions: string;
  readonly deliveryMetadata: Readonly<Record<string, unknown>>;
};

export const createProvisioningDelivery = (params: ProvisioningDelivery): ProvisioningDelivery => ({
  accountReference: params.accountReference,
  secret: params.secret,
  activationInstructions: params.activationInstructions,
  deliveryMetadata: { ...params.deliveryMetadata },
});

export const formatProvisioningDeliveryForDisplay = (delivery: ProvisioningDelivery): string => {
  return JSON.stringify({
    accountReference: delivery.accountReference,
    secret: REDACTED_SECRET,
    activationInstructions: delivery.activationInstructions,
    deliveryMetadata: delivery.deliveryMetadata,
  });
};
