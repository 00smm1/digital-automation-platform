/**
 * Lightweight input validation helpers for constructors and factories.
 */
export const Guard = {
  againstNullOrUndefined<T>(value: T | null | undefined, argumentName: string): T {
    if (value === null || value === undefined) {
      throw new Error(`${argumentName} must not be null or undefined.`);
    }

    return value;
  },

  againstEmptyString(value: string, argumentName: string): string {
    if (value.trim().length === 0) {
      throw new Error(`${argumentName} must not be empty.`);
    }

    return value;
  },
} as const;
