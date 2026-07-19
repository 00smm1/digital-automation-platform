export type { AutomationDefinitionId } from './automation-definition.js';
export { AutomationDefinition } from './automation-definition.js';
export type { AutomationDefinitionProps } from './automation-definition.js';
export type { AutomationDefinitionStatus } from './automation-definition-status.js';
export {
  AUTOMATION_DEFINITION_STATUSES,
  isAutomationDefinitionStatus,
} from './automation-definition-status.js';
export { AutomationTrigger } from './automation-trigger.js';
export { AutomationCondition } from './automation-condition.js';
export { ConditionGroup } from './condition-group.js';
export type { ConditionGroupMode } from './condition-group.js';
export { CONDITION_GROUP_MODES } from './condition-group.js';
export type { ConditionOperator } from './condition-operator.js';
export { CONDITION_OPERATORS, isConditionOperator } from './condition-operator.js';
export type {
  NormalizedPlatformEvent,
  NormalizedPlatformEventPayload,
} from './normalized-platform-event.js';
export { createNormalizedPlatformEvent } from './normalized-platform-event.js';
export type { AutomationDefinitionRepository } from './automation-definition-repository.js';
export { InMemoryAutomationDefinitionRepository } from './in-memory-automation-definition-repository.js';
export { RuleEvaluator, createRuleEvaluator, resolveFieldPath } from './rule-evaluator.js';
export type { RuleEvaluationResult } from './rule-evaluator.js';
export {
  InvalidAutomationDefinitionError,
  InvalidAutomationTriggerError,
  InvalidAutomationConditionError,
  InvalidConditionOperatorError,
  InvalidAutomationConditionGroupError,
  InvalidAutomationPriorityError,
  InvalidAutomationWorkflowReferenceError,
} from './errors/automation-definition-errors.js';
