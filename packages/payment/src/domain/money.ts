const ISO4217_PATTERN = /^[A-Z]{3}$/;

export type Money = {
  readonly amountMinorUnits: number;
  readonly currency: string;
};

export const createMoney = (params: {
  readonly amountMinorUnits: number;
  readonly currency: string;
}): Money | undefined => {
  if (!Number.isInteger(params.amountMinorUnits)) {
    return undefined;
  }

  if (params.amountMinorUnits < 0) {
    return undefined;
  }

  const currency = params.currency.trim().toUpperCase();

  if (!ISO4217_PATTERN.test(currency)) {
    return undefined;
  }

  return {
    amountMinorUnits: params.amountMinorUnits,
    currency,
  };
};

export const moneyEquals = (left: Money, right: Money): boolean =>
  left.amountMinorUnits === right.amountMinorUnits && left.currency === right.currency;

export const formatMoney = (money: Money): string => `${money.amountMinorUnits}:${money.currency}`;
