import { Result } from '@dap/core';
import type { PaymentConfirmation } from '../../domain/payment-confirmation.js';
import type { PaymentFailure } from '../../domain/errors/payment-errors.js';
import type { PaymentGatewayIngressInput } from './payment-gateway-ingress-input.js';

export type PaymentGatewayAdapter = {
  normalize(
    input: PaymentGatewayIngressInput,
  ): Promise<Result<PaymentConfirmation, PaymentFailure>>;
};

export type { PaymentGatewayIngressInput };
