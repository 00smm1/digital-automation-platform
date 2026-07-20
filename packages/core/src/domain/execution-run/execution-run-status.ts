export const EXECUTION_RUN_STATUSES = [
  'received',
  'processing',
  'completed',
  'rejected',
  'failed',
] as const;

export type ExecutionRunStatus = (typeof EXECUTION_RUN_STATUSES)[number];

const VALID_TRANSITIONS: Readonly<Record<ExecutionRunStatus, readonly ExecutionRunStatus[]>> = {
  received: ['processing', 'rejected'],
  processing: ['completed', 'failed', 'rejected'],
  completed: [],
  rejected: [],
  failed: [],
};

export const canTransitionExecutionRunStatus = (
  from: ExecutionRunStatus,
  to: ExecutionRunStatus,
): boolean => VALID_TRANSITIONS[from].includes(to);

export const isTerminalExecutionRunStatus = (status: ExecutionRunStatus): boolean =>
  status === 'completed' || status === 'rejected' || status === 'failed';
