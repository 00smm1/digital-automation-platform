import type {
  WooCommerceSignatureVerificationInput,
  WooCommerceSignatureVerifier,
} from './woocommerce-signature-verifier.js';

export type FakeWooCommerceSignatureVerifierOptions = {
  readonly configuredValid?: boolean;
  readonly configuredException?: Error;
};

/**
 * Deterministic signature verifier for tests.
 */
export class FakeWooCommerceSignatureVerifier implements WooCommerceSignatureVerifier {
  private configuredValid = true;
  private configuredException?: Error;

  constructor(options: FakeWooCommerceSignatureVerifierOptions = {}) {
    this.configuredValid = options.configuredValid ?? true;
    this.configuredException = options.configuredException;
  }

  configureValid(valid: boolean): void {
    this.configuredValid = valid;
    this.configuredException = undefined;
  }

  configureException(error: Error): void {
    this.configuredException = error;
    this.configuredValid = false;
  }

  reset(): void {
    this.configuredValid = true;
    this.configuredException = undefined;
  }

  verify(_input: WooCommerceSignatureVerificationInput) {
    if (this.configuredException !== undefined) {
      throw this.configuredException;
    }

    return { valid: this.configuredValid };
  }
}
