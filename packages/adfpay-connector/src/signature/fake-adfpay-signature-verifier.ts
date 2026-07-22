import type {
  AdfPaySignatureVerificationInput,
  AdfPaySignatureVerifier,
} from './adfpay-signature-verifier.js';

export type FakeAdfPaySignatureVerifierOptions = {
  readonly configuredValid?: boolean;
  readonly configuredException?: Error;
};

export class FakeAdfPaySignatureVerifier implements AdfPaySignatureVerifier {
  private configuredValid = true;
  private configuredException?: Error;

  constructor(options: FakeAdfPaySignatureVerifierOptions = {}) {
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

  verify(_input: AdfPaySignatureVerificationInput) {
    if (this.configuredException !== undefined) {
      throw this.configuredException;
    }

    return { valid: this.configuredValid };
  }
}
