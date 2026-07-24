import { Result } from '../../../shared/types/result.js';
import {
  createProvisioningDelivery,
  formatProvisioningDeliveryForDisplay,
} from '../../../domain/fulfillment/provisioning-delivery.js';
import {
  createDigitalProductProvisioningResult,
  type DigitalProductProvisioningRequest,
  type DigitalProductProvisioningResult,
} from '../../../domain/provisioning/digital-product-provisioning.js';
import { DigitalProductProvisioningError } from '../../../domain/provisioning/errors/provisioning-errors.js';
import type { DigitalProductProvisioningPort } from '../ports/digital-product-provisioning-port.js';

export type FakeDigitalProductProvisioningAdapterOptions = {
  readonly providerReferencePrefix?: string;
  readonly configuredError?: DigitalProductProvisioningError;
  readonly configuredException?: Error;
};

/**
 * Deterministic fake digital product provisioning adapter for tests and local composition.
 */
export class FakeDigitalProductProvisioningAdapter implements DigitalProductProvisioningPort {
  private readonly providerReferencePrefix: string;
  private configuredError?: DigitalProductProvisioningError;
  private configuredException?: Error;
  private provisionCount = 0;
  private lastRequest?: DigitalProductProvisioningRequest;

  constructor(options: FakeDigitalProductProvisioningAdapterOptions = {}) {
    this.providerReferencePrefix = options.providerReferencePrefix ?? 'provision';
    this.configuredError = options.configuredError;
    this.configuredException = options.configuredException;
  }

  configureError(error: DigitalProductProvisioningError): void {
    this.configuredError = error;
    this.configuredException = undefined;
  }

  configureException(error: Error): void {
    this.configuredException = error;
    this.configuredError = undefined;
  }

  reset(): void {
    this.configuredError = undefined;
    this.configuredException = undefined;
    this.provisionCount = 0;
  }

  getInvocationCount(): number {
    return this.provisionCount;
  }

  getLastRequest(): DigitalProductProvisioningRequest | undefined {
    return this.lastRequest;
  }

  async provision(
    request: DigitalProductProvisioningRequest,
  ): Promise<
    import('../../../shared/types/result.js').Result<
      DigitalProductProvisioningResult,
      DigitalProductProvisioningError
    >
  > {
    if (this.configuredException !== undefined) {
      throw this.configuredException;
    }

    if (this.configuredError !== undefined) {
      return Result.fail(this.configuredError);
    }

    this.provisionCount += 1;
    this.lastRequest = request;
    const sequence = this.provisionCount;
    const secret = `secret-${request.orderReference}-${sequence}`;

    const delivery = createProvisioningDelivery({
      accountReference: `${this.providerReferencePrefix}-${request.customerReference}-${sequence}`,
      secret,
      activationInstructions: 'Use the account reference and secret to activate your product.',
      deliveryMetadata: {
        productReference: request.productReference,
        orderReference: request.orderReference,
      },
    });

    return Result.ok(
      createDigitalProductProvisioningResult({
        providerReference: `${this.providerReferencePrefix}-${request.orderReference}`,
        delivery,
      }),
    );
  }

  formatDeliveryForSafeLogging(result: DigitalProductProvisioningResult): string {
    return formatProvisioningDeliveryForDisplay(result.delivery);
  }
}
