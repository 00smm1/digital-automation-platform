/**
 * Branded event name for compile-time safety when subscribing and publishing.
 */
export type EventName<TName extends string = string> = TName & {
  readonly __eventNameBrand: unique symbol;
};

export const createEventName = <TName extends string>(name: TName): EventName<TName> => {
  return name as EventName<TName>;
};
