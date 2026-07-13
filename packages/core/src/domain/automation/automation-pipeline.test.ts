import { describe, expect, it } from 'vitest';

import type { AutomationStep } from './automation-step.js';
import { AutomationPipeline } from './automation-pipeline.js';
import { AutomationValidationError } from './errors/automation-errors.js';
import { createRetryPolicy } from './retry-policy.js';

const createStep = (stepName: string): AutomationStep => ({
  stepName,
  async execute() {
    const timestamp = new Date();

    return {
      stepName,
      status: 'success',
      startedAt: timestamp,
      completedAt: timestamp,
      attempts: 1,
    };
  },
});

describe('AutomationPipeline', () => {
  it('creates a valid pipeline', () => {
    const pipeline = new AutomationPipeline({
      id: 'pipeline-1',
      steps: [createStep('step-1')],
    });

    expect(pipeline.id).toBe('pipeline-1');
    expect(pipeline.steps).toHaveLength(1);
  });

  it('rejects an empty pipeline id', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: '',
          steps: [createStep('step-1')],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects a whitespace-only pipeline id', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: '   ',
          steps: [createStep('step-1')],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects a pipeline with zero steps', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects an empty step name', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [createStep('')],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects a whitespace-only step name', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [createStep('   ')],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects duplicate step names', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [createStep('step-1'), createStep('step-1')],
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects retry policies with maxAttempts less than 1', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [createStep('step-1')],
          retryPolicy: createRetryPolicy({ maxAttempts: 0 }),
        }),
    ).toThrow(AutomationValidationError);
  });

  it('rejects retry policies with delayMs less than 0', () => {
    expect(
      () =>
        new AutomationPipeline({
          id: 'pipeline-1',
          steps: [createStep('step-1')],
          retryPolicy: createRetryPolicy({ maxAttempts: 1, delayMs: -1 }),
        }),
    ).toThrow(AutomationValidationError);
  });
});
