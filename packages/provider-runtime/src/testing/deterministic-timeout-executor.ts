import type {
  TimeoutExecutor,
  TimeoutExecutorOutcome,
} from '../application/ports/timeout-executor-port.js';

export type ControlledTimeoutMode =
  'complete' | 'timeout' | 'reject' | 'late-resolve' | 'late-reject';

export class DeterministicTimeoutExecutor implements TimeoutExecutor {
  private mode: ControlledTimeoutMode = 'complete';
  private pendingOperation: (() => Promise<unknown>) | undefined;
  private lateValue: unknown;
  private lateError: Error = new Error('controlled-timeout-rejection');

  setMode(mode: ControlledTimeoutMode): void {
    this.mode = mode;
  }

  setLateValue(value: unknown): void {
    this.lateValue = value;
  }

  setLateError(error: Error): void {
    this.lateError = error;
  }

  async execute<T>(params: {
    readonly operation: () => Promise<T>;
    readonly timeoutMilliseconds: number;
  }): Promise<TimeoutExecutorOutcome<T>> {
    void params.timeoutMilliseconds;
    this.pendingOperation = params.operation as () => Promise<unknown>;

    if (this.mode === 'reject') {
      try {
        await params.operation();
      } catch {
        return { kind: 'operation-completed', value: undefined as T };
      }
    }

    if (this.mode === 'timeout') {
      void params.operation().catch(() => undefined);
      return { kind: 'operation-timed-out' };
    }

    if (this.mode === 'late-resolve') {
      void params
        .operation()
        .then(() => undefined)
        .catch(() => undefined);
      void Promise.resolve(this.lateValue).then(() => undefined);
      return { kind: 'operation-timed-out' };
    }

    if (this.mode === 'late-reject') {
      void params
        .operation()
        .then(() => undefined)
        .catch(() => undefined);
      void Promise.reject(this.lateError).catch(() => undefined);
      return { kind: 'operation-timed-out' };
    }

    const value = await params.operation();
    return { kind: 'operation-completed', value };
  }
}

export const createDeterministicTimeoutExecutor = (): DeterministicTimeoutExecutor =>
  new DeterministicTimeoutExecutor();
