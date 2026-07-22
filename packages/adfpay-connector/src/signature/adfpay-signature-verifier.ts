export type AdfPaySignatureVerificationInput = {
  readonly rawBody: string;
  readonly signature: string;
  readonly secret: string;
};

export type AdfPaySignatureVerificationResult = {
  readonly valid: boolean;
};

export type AdfPaySignatureVerifier = {
  verify(input: AdfPaySignatureVerificationInput): AdfPaySignatureVerificationResult;
};
