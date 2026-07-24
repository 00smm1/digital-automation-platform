import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

const readSourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...readSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(readFileSync(fullPath, 'utf8'));
    }
  }

  return files;
};

const providerRuntimeSourceFiles = readSourceFiles(join(repoRoot, 'packages/provider-runtime/src'));

describe('Sprint 19 architecture — provider runtime boundaries [V]', () => {
  it('[V6] core provisioning workflow step depends on ProviderRuntimePort', () => {
    const provisionStepSource = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/workflow-pipeline/steps/provision-digital-product-step-executor.ts',
      ),
      'utf8',
    );
    const stepRegistrySource = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/workflow-pipeline/create-digital-fulfillment-step-registry.ts',
      ),
      'utf8',
    );

    expect(provisionStepSource).toContain('ProviderRuntimePort');
    expect(provisionStepSource).toContain('providerRuntimePort.executeProvisioning');
    expect(stepRegistrySource).toContain('ProviderRuntimePort');
    expect(stepRegistrySource).toContain('providerRuntimePort');
  });

  it('[V1][V2] provider-runtime package does not import WooCommerce or AdfPay connectors', () => {
    for (const source of providerRuntimeSourceFiles) {
      expect(source).not.toMatch(/woocommerce-connector/);
      expect(source).not.toMatch(/@dap\/woocommerce-connector/);
      expect(source).not.toMatch(/WooCommerce/);
      expect(source).not.toMatch(/adfpay-connector/);
      expect(source).not.toMatch(/@dap\/adfpay-connector/);
      expect(source).not.toMatch(/AdfPay/);
    }
  });

  it('[V7] provisioning step executor does not use DigitalProductProvisioningPort', () => {
    const provisionStepSource = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/workflow-pipeline/steps/provision-digital-product-step-executor.ts',
      ),
      'utf8',
    );

    expect(provisionStepSource).not.toContain('DigitalProductProvisioningPort');
    expect(provisionStepSource).not.toContain('FakeDigitalProductProvisioningAdapter');
    expect(provisionStepSource).not.toContain('digitalProductProvisioningPort');
  });

  it('[V15] provider runtime application logic does not use automatic fallback provider loops', () => {
    const runtimeSource = readFileSync(
      join(repoRoot, 'packages/provider-runtime/src/application/provider-runtime.ts'),
      'utf8',
    );

    expect(runtimeSource).not.toMatch(/fallbackProvider/);
    expect(runtimeSource).not.toMatch(/selectNextProvider/);
    expect(runtimeSource).not.toMatch(/retryProvider/);
  });

  it('[V8] production fulfillment stack composition does not wire fake provider adapter', () => {
    const fulfillmentStackSource = readFileSync(
      join(
        repoRoot,
        'packages/core/src/application/fulfillment/composition/create-digital-fulfillment-stack.ts',
      ),
      'utf8',
    );

    expect(fulfillmentStackSource).toContain('createDigitalProviderRuntimeComposition');
    expect(fulfillmentStackSource).not.toMatch(/FakeProviderAdapter\(/);
    expect(fulfillmentStackSource).not.toMatch(/createTestProviderRuntimeStack/);
  });
});
