import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

describe('Sprint 17 revision architecture boundaries', () => {
  it('[9] PaymentProcessingService does not import InMemoryPaymentRepository', () => {
    const source = readFileSync(
      join(repoRoot, 'packages/payment/src/application/payment-processing-service.ts'),
      'utf8',
    );

    expect(source).not.toContain('InMemoryPaymentRepository');
    expect(source).toContain('createPaymentRecordFromConfirmation');
  });
});
