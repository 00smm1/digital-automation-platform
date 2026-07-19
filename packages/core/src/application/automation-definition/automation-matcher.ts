import type { AutomationDefinition } from '../../domain/automation-definition/automation-definition.js';
import type { NormalizedPlatformEvent } from '../../domain/automation-definition/normalized-platform-event.js';
import type { AutomationDefinitionRepository } from '../../domain/automation-definition/automation-definition-repository.js';
import { RuleEvaluator } from '../../domain/automation-definition/rule-evaluator.js';

export type AutomationMatcherDependencies = {
  readonly repository: AutomationDefinitionRepository;
  readonly ruleEvaluator?: RuleEvaluator;
};

/**
 * Matches normalized platform events to enabled automation definitions.
 *
 * Priority ordering: higher numeric priority values win (sorted descending).
 * Tie-breaker: ascending automation id (lexicographic).
 *
 * Does not execute workflows.
 */
export class AutomationMatcher {
  private readonly repository: AutomationDefinitionRepository;
  private readonly ruleEvaluator: RuleEvaluator;

  constructor(dependencies: AutomationMatcherDependencies) {
    this.repository = dependencies.repository;
    this.ruleEvaluator = dependencies.ruleEvaluator ?? new RuleEvaluator();
  }

  async match(event: NormalizedPlatformEvent): Promise<readonly AutomationDefinition[]> {
    const candidates = await this.repository.findEnabledByEventType(event.eventType);
    const matched: AutomationDefinition[] = [];

    for (const definition of candidates) {
      if (!definition.trigger.matches(event.eventType)) {
        continue;
      }

      const evaluation = this.ruleEvaluator.evaluateConditionGroup(
        definition.conditions,
        event.payload,
      );

      if (evaluation.matched) {
        matched.push(definition);
      }
    }

    return matched.sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }

      return left.id.localeCompare(right.id);
    });
  }
}
