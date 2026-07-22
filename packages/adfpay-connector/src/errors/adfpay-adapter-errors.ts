export class AdfPayAdapterError extends Error {
  readonly code = 'ADFPAY_ADAPTER';

  constructor(
    message: string,
    readonly failureCode: string,
  ) {
    super(message);
  }
}
