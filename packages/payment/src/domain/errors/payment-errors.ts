export class PaymentFailure extends Error {
  readonly code = 'PAYMENT';

  constructor(
    message: string,
    readonly failureCode: string,
  ) {
    super(message);
  }
}

export class PaymentVerificationFailure extends PaymentFailure {
  constructor(message = 'Payment authenticity verification failed.') {
    super(message, 'VERIFICATION_FAILED');
  }
}

export class PaymentParserFailure extends PaymentFailure {
  constructor(message = 'Payment payload is malformed.') {
    super(message, 'MALFORMED_PAYLOAD');
  }
}

export class PaymentCorrelationFailure extends PaymentFailure {
  constructor(message = 'Payment could not be correlated to an order.') {
    super(message, 'CORRELATION_FAILED');
  }
}

export class DuplicatePaymentFailure extends PaymentFailure {
  constructor(message = 'Duplicate payment delivery detected.') {
    super(message, 'DUPLICATE_PAYMENT');
  }
}

export class AlreadyConfirmedPaymentFailure extends PaymentFailure {
  constructor(message = 'Order payment has already been confirmed.') {
    super(message, 'ALREADY_CONFIRMED');
  }
}

export class PaymentConflictFailure extends PaymentFailure {
  constructor(message = 'Payment conflict detected.') {
    super(message, 'PAYMENT_CONFLICT');
  }
}

export class PaymentProcessingFailure extends PaymentFailure {
  constructor(message = 'Payment processing failed.') {
    super(message, 'REPOSITORY_FAILED');
  }
}

export class PaymentAuthorizationRejectedFailure extends PaymentFailure {
  constructor(message = 'Payment authorization rejected.') {
    super(message, 'AUTHORIZATION_REJECTED');
  }
}
