/**
 * Branded identifier to prevent primitive obsession.
 */
export type Identifier<TBrand extends string = string> = string & {
  readonly __brand: TBrand;
};

export const createIdentifier = <TBrand extends string>(
  brand: TBrand,
  value: string,
): Identifier<TBrand> => {
  return value as Identifier<TBrand>;
};
