export type WorkflowHistoryEntryType =
  | 'state-transition'
  | 'step-started'
  | 'step-completed'
  | 'step-failed'
  | 'step-retry'
  | 'workflow-cancelled'
  | 'workflow-timeout';

export type WorkflowHistoryEntry = {
  readonly timestamp: Date;
  readonly type: WorkflowHistoryEntryType;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

/**
 * Append-only audit trail for a workflow execution.
 */
export class WorkflowExecutionHistory {
  private readonly _entries: WorkflowHistoryEntry[] = [];

  get entries(): readonly WorkflowHistoryEntry[] {
    return this._entries;
  }

  append(entry: WorkflowHistoryEntry): void {
    this._entries.push(entry);
  }

  static create(): WorkflowExecutionHistory {
    return new WorkflowExecutionHistory();
  }
}
