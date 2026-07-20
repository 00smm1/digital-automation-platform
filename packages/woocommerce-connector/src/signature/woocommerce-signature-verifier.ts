export type WooCommerceSignatureVerificationInput = {
  readonly rawBody: string;
  readonly signature: string;
  readonly secret: string;
};

export type WooCommerceSignatureVerificationResult = {
  readonly valid: boolean;
};

export type WooCommerceSignatureVerifier = {
  verify(input: WooCommerceSignatureVerificationInput): WooCommerceSignatureVerificationResult;
};
