export class WooCommerceAdapterError extends Error {
  readonly code = 'WOOCOMMERCE_ADAPTER';

  constructor(
    message: string,
    readonly failureCode: string,
  ) {
    super(message);
  }
}

export class WooCommerceSignatureVerificationError extends WooCommerceAdapterError {
  constructor(message = 'WooCommerce webhook signature verification failed.') {
    super(message, 'INVALID_SIGNATURE');
  }
}

export class WooCommercePayloadParseError extends WooCommerceAdapterError {
  constructor(message = 'WooCommerce order payload is malformed.') {
    super(message, 'MALFORMED_PAYLOAD');
  }
}
