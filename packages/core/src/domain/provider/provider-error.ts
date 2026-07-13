import { DomainError } from '../../shared/errors/domain-error.js';
import type { ProviderCapability } from './provider-capability.js';

export class ProviderError extends DomainError {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    readonly providerId?: string,
    readonly capability?: ProviderCapability,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
  }
}

export const createProviderError = (params: {
  code: string;
  message: string;
  providerId?: string;
  capability?: ProviderCapability;
  cause?: Error;
}): ProviderError => {
  return new ProviderError(params.code, params.message, params.providerId, params.capability, {
    cause: params.cause,
  });
};
