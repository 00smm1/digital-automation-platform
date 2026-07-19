export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'exists',
  'notExists',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'contains',
  'in',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const isConditionOperator = (value: string): value is ConditionOperator => {
  return (CONDITION_OPERATORS as readonly string[]).includes(value);
};
