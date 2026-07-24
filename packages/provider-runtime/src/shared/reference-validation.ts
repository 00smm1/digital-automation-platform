export type Identifier<TBrand extends string = string> = string & {
  readonly __brand: TBrand;
};

export const createIdentifier = <TBrand extends string>(
  _brand: TBrand,
  value: string,
): Identifier<TBrand> => value as Identifier<TBrand>;

export type ReferenceValidationError = {
  readonly reasonCode:
    | 'non-string-reference'
    | 'empty-reference'
    | 'whitespace-only-reference'
    | 'malformed-reference';
};

export const parseNonEmptyReference = <TBrand extends string>(
  brand: TBrand,
  value: unknown,
): import('../shared/result.js').Result<Identifier<TBrand>, ReferenceValidationError> => {
  if (typeof value !== 'string') {
    return { ok: false, error: { reasonCode: 'non-string-reference' } };
  }

  if (value.trim().length === 0) {
    return {
      ok: false,
      error: {
        reasonCode: value.length === 0 ? 'empty-reference' : 'whitespace-only-reference',
      },
    };
  }

  if (value !== value.trim()) {
    return { ok: false, error: { reasonCode: 'malformed-reference' } };
  }

  return { ok: true, value: createIdentifier(brand, value) };
};
