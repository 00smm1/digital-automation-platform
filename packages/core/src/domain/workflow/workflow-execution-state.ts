export const WORKFLOW_EXECUTION_STATES = [
  'Pending',
  'Running',
  'Succeeded',
  'Failed',
  'Cancelled',
] as const;

export type WorkflowExecutionState = (typeof WORKFLOW_EXECUTION_STATES)[number];

export const isWorkflowExecutionState = (value: string): value is WorkflowExecutionState => {
  return (WORKFLOW_EXECUTION_STATES as readonly string[]).includes(value);
};

export const WORKFLOW_TERMINAL_STATES: readonly WorkflowExecutionState[] = [
  'Succeeded',
  'Failed',
  'Cancelled',
];

export const isWorkflowTerminalState = (state: WorkflowExecutionState): boolean => {
  return WORKFLOW_TERMINAL_STATES.includes(state);
};
