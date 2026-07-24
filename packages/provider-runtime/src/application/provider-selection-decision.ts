import type { ProviderDescriptor } from '../domain/provider-descriptor.js';

export type ProviderSelectionDecision =
  | {
      readonly kind: 'provider-selected';
      readonly descriptor: ProviderDescriptor;
      readonly selectionReasonCode: 'SELECTED_BY_POLICY';
      readonly evaluatedCandidateCount: number;
    }
  | { readonly kind: 'invalid-selection-request'; readonly safeCode: 'INVALID_SELECTION_REQUEST' }
  | {
      readonly kind: 'no-provider-supports-capability';
      readonly safeCode: 'NO_PROVIDER_SUPPORTS_CAPABILITY';
    }
  | { readonly kind: 'no-active-provider'; readonly safeCode: 'NO_ACTIVE_PROVIDER' }
  | {
      readonly kind: 'no-eligible-provider-health';
      readonly safeCode: 'NO_ELIGIBLE_PROVIDER_HEALTH';
    }
  | {
      readonly kind: 'provider-selection-conflict';
      readonly safeCode: 'PROVIDER_SELECTION_CONFLICT';
    }
  | { readonly kind: 'registry-failed'; readonly safeCode: 'PROVIDER_REGISTRY_FAILED' };
