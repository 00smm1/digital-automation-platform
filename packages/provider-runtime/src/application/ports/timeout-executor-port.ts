export type TimeoutExecutorOutcome<T> =
  | { readonly kind: 'operation-completed'; readonly value: T }
  | { readonly kind: 'operation-timed-out' };

export type TimeoutExecutor = {
  execute<T>(params: {
    readonly operation: () => Promise<T>;
    readonly timeoutMilliseconds: number;
  }): Promise<TimeoutExecutorOutcome<T>>;
};
