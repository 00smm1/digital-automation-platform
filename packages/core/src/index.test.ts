import { describe, expect, it } from 'vitest';

import {
  AggregateRoot,
  ApplicationError,
  DomainError,
  Entity,
  Guard,
  Result,
  ValueObject,
  createIdentifier,
} from './index.js';
import type {
  DomainEvent,
  ICommand,
  ICommandHandler,
  IDomainEventHandler,
  IDomainService,
  IQuery,
  IQueryHandler,
  IRepository,
  Identifier,
} from './index.js';

type TestId = Identifier<'Test'>;

class TestEntity extends Entity<TestId> {
  constructor(id: TestId) {
    super(id);
  }
}

class TestAggregate extends AggregateRoot<TestId> {
  constructor(id: TestId) {
    super(id);
  }

  recordEvent(event: DomainEvent): void {
    this.addDomainEvent(event);
  }
}

class TestValue extends ValueObject<{ label: string }> {
  constructor(label: string) {
    super({ label });
  }
}

class TestDomainError extends DomainError {
  readonly code = 'TEST_DOMAIN_ERROR';
}

class TestApplicationError extends ApplicationError {
  readonly code = 'TEST_APPLICATION_ERROR';
}

describe('@dap/core foundation', () => {
  it('compares entities by identifier', () => {
    const left = new TestEntity(createIdentifier('Test', 'entity-1'));
    const right = new TestEntity(createIdentifier('Test', 'entity-1'));
    const other = new TestEntity(createIdentifier('Test', 'entity-2'));

    expect(left.equals(right)).toBe(true);
    expect(left.equals(other)).toBe(false);
  });

  it('tracks domain events on aggregate roots', () => {
    const aggregate = new TestAggregate(createIdentifier('Test', 'aggregate-1'));
    const event: DomainEvent = {
      eventId: 'event-1',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      aggregateId: 'aggregate-1',
      eventName: 'test.event',
    };

    aggregate.recordEvent(event);

    expect(aggregate.domainEvents).toHaveLength(1);
    expect(aggregate.domainEvents[0]).toEqual(event);

    aggregate.clearDomainEvents();
    expect(aggregate.domainEvents).toHaveLength(0);
  });

  it('compares value objects structurally', () => {
    const left = new TestValue('alpha');
    const right = new TestValue('alpha');
    const other = new TestValue('beta');

    expect(left.equals(right)).toBe(true);
    expect(left.equals(other)).toBe(false);
  });

  it('models command and query contracts', () => {
    const command: ICommand = { commandName: 'platform.bootstrap' };
    const query: IQuery<string> = { queryName: 'platform.status' };

    const commandHandler: ICommandHandler<typeof command, void> = {
      commandName: command.commandName,
      async execute() {
        return undefined;
      },
    };

    const queryHandler: IQueryHandler<typeof query, string> = {
      queryName: query.queryName,
      async execute() {
        return 'ok';
      },
    };

    expect(commandHandler.commandName).toBe('platform.bootstrap');
    expect(queryHandler.queryName).toBe('platform.status');
  });

  it('defines repository, service, and event handler contracts', () => {
    const repository: IRepository<TestEntity, TestId> = {
      async findById() {
        return null;
      },
      async save() {
        return undefined;
      },
      async delete() {
        return undefined;
      },
    };

    const service: IDomainService = { serviceName: 'test-service' };

    const eventHandler: IDomainEventHandler<DomainEvent> = {
      eventName: 'test.event',
      handle() {
        return undefined;
      },
    };

    expect(repository).toBeDefined();
    expect(service.serviceName).toBe('test-service');
    expect(eventHandler.eventName).toBe('test.event');
  });

  it('supports result and guard utilities', () => {
    const success = Result.ok('value');
    const failure = Result.fail(new Error('failed'));

    expect(Result.isOk(success)).toBe(true);
    expect(Result.isFail(failure)).toBe(true);
    expect(Guard.againstEmptyString('valid', 'name')).toBe('valid');
  });

  it('exposes typed error hierarchies', () => {
    const domainError = new TestDomainError('domain failure');
    const applicationError = new TestApplicationError('application failure');

    expect(domainError.layer).toBe('domain');
    expect(applicationError.layer).toBe('application');
  });
});
