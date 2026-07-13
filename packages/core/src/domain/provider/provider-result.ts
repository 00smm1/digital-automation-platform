import type { ProviderResponse, ProviderResponseData } from './provider-response.js';
import type { ProviderError } from './provider-error.js';

export type ProviderResult<TData extends ProviderResponseData = ProviderResponseData> =
  | { readonly ok: true; readonly value: ProviderResponse<TData> }
  | { readonly ok: false; readonly error: ProviderError };

export const ProviderResult = {
  ok<TData extends ProviderResponseData>(value: ProviderResponse<TData>): ProviderResult<TData> {
    return { ok: true, value };
  },

  fail<TData extends ProviderResponseData = ProviderResponseData>(
    error: ProviderError,
  ): ProviderResult<TData> {
    return { ok: false, error };
  },

  isOk<TData extends ProviderResponseData>(
    result: ProviderResult<TData>,
  ): result is { readonly ok: true; readonly value: ProviderResponse<TData> } {
    return result.ok;
  },

  isFail<TData extends ProviderResponseData>(
    result: ProviderResult<TData>,
  ): result is { readonly ok: false; readonly error: ProviderError } {
    return !result.ok;
  },
} as const;
