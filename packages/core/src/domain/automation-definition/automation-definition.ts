import { AggregateRoot } from '../entities/aggregate-root.js';
import type { Identifier } from '../../shared/types/identifier.js';
import type { AutomationDefinitionStatus } from './automation-definition-status.js';
import { AutomationTrigger } from './automation-trigger.js';
import { ConditionGroup } from './condition-group.js';
import {
  InvalidAutomationDefinitionError,
  InvalidAutomationPriorityError,
  InvalidAutomationWorkflowReferenceError,
} from './errors/automation-definition-errors.js';

export type AutomationDefinitionId = Identifier<'AutomationDefinition'>;

export type AutomationDefinitionProps = {
  readonly name: string;
  readonly status: AutomationDefinitionStatus;
  readonly trigger: AutomationTrigger;
  readonly conditions: ConditionGroup;
  readonly workflowReference: string;
  readonly priority: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Provider-independent automation rule definition for event-driven workflow selection.
 */
export class AutomationDefinition extends AggregateRoot<AutomationDefinitionId> {
  private _name: string;
  private _status: AutomationDefinitionStatus;
  private readonly _trigger: AutomationTrigger;
  private readonly _conditions: ConditionGroup;
  private readonly _workflowReference: string;
  private readonly _priority: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(id: AutomationDefinitionId, props: AutomationDefinitionProps) {
    super(id);
    this._name = props.name;
    this._status = props.status;
    this._trigger = props.trigger;
    this._conditions = props.conditions;
    this._workflowReference = props.workflowReference;
    this._priority = props.priority;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(params: {
    id: AutomationDefinitionId;
    name: string;
    trigger: AutomationTrigger;
    conditions?: ConditionGroup;
    workflowReference: string;
    priority?: number;
    status?: AutomationDefinitionStatus;
    createdAt?: Date;
  }): AutomationDefinition {
    const name = params.name.trim();

    if (name.length === 0) {
      throw new InvalidAutomationDefinitionError('Automation name must not be empty.', params.id);
    }

    const workflowReference = params.workflowReference.trim();

    if (workflowReference.length === 0) {
      throw new InvalidAutomationWorkflowReferenceError('Workflow reference must not be empty.');
    }

    const priority = params.priority ?? 0;

    if (!Number.isSafeInteger(priority)) {
      throw new InvalidAutomationPriorityError(priority);
    }

    const timestamp = params.createdAt ?? new Date();

    return new AutomationDefinition(params.id, {
      name,
      status: params.status ?? 'enabled',
      trigger: params.trigger,
      conditions: params.conditions ?? ConditionGroup.create({ mode: 'ALL', conditions: [] }),
      workflowReference,
      priority,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  static restore(
    id: AutomationDefinitionId,
    props: AutomationDefinitionProps,
  ): AutomationDefinition {
    return new AutomationDefinition(id, props);
  }

  get name(): string {
    return this._name;
  }

  get status(): AutomationDefinitionStatus {
    return this._status;
  }

  get trigger(): AutomationTrigger {
    return this._trigger;
  }

  get conditions(): ConditionGroup {
    return this._conditions;
  }

  get workflowReference(): string {
    return this._workflowReference;
  }

  get priority(): number {
    return this._priority;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  isEnabled(): boolean {
    return this._status === 'enabled';
  }

  enable(): void {
    this._status = 'enabled';
    this._updatedAt = new Date();
  }

  disable(): void {
    this._status = 'disabled';
    this._updatedAt = new Date();
  }

  toProps(): AutomationDefinitionProps {
    return {
      name: this._name,
      status: this._status,
      trigger: this._trigger,
      conditions: this._conditions,
      workflowReference: this._workflowReference,
      priority: this._priority,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
