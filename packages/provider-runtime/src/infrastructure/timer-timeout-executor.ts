import type {
  TimeoutExecutor,
  TimeoutExecutorOutcome,
} from '../application/ports/timeout-executor-port.js';

/**
 * Races an operation against a timer with exactly one outward completion.
 *
 * - First completion wins; later resolve/reject from `operation()` is ignored.
 * - Timer is cleared when the operation settles first.
 * - Late rejections after timeout are observed safely (no unhandled rejection).
 */
export class TimerTimeoutExecutor implements TimeoutExecutor {
  async execute<T>(params: {
    readonly operation: () => Promise<T>;
    readonly timeoutMilliseconds: number;
  }): Promise<TimeoutExecutorOutcome<T>> {
    let settled = false;

    return new Promise<TimeoutExecutorOutcome<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        resolve({ kind: 'operation-timed-out' });
      }, params.timeoutMilliseconds);

      params
        .operation()
        .then((value) => {
          clearTimeout(timer);
          if (settled) {
            return;
          }

          settled = true;
          resolve({ kind: 'operation-completed', value });
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          if (settled) {
            void error;
            return;
          }

          settled = true;
          reject(error);
        });
    });
  }
}
