import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

const readPackageJson = (packagePath: string) =>
  JSON.parse(readFileSync(join(repoRoot, packagePath, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

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

describe('Sprint 17 package boundaries', () => {
  it('[S96] payment core does not import AdfPay connector', () => {
    const paymentFiles = readSourceFiles(join(repoRoot, 'packages/payment/src'));
    for (const source of paymentFiles) {
      expect(source).not.toMatch(/@dap\/adfpay-connector/);
      expect(source).not.toMatch(/adfpay-connector/);
    }
  });

  it('[S97] payment core does not import WooCommerce connector', () => {
    const paymentFiles = readSourceFiles(join(repoRoot, 'packages/payment/src'));
    for (const source of paymentFiles) {
      expect(source).not.toMatch(/woocommerce-connector/);
    }
  });

  it('[S98] AdfPay connector depends only on allowed provider-neutral contracts', () => {
    const packageJson = readPackageJson('packages/adfpay-connector');
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(Object.keys(dependencies)).toEqual(
      expect.arrayContaining(['@dap/payment', '@dap/core']),
    );
    expect(dependencies).not.toHaveProperty('@dap/woocommerce-connector');
  });

  it('[S99][S100][S101][S102] core packages do not import AdfPay-specific models', () => {
    const coreFiles = readSourceFiles(join(repoRoot, 'packages/core/src'));
    for (const source of coreFiles) {
      expect(source).not.toMatch(/AdfPay/);
      expect(source).not.toMatch(/@dap\/adfpay-connector/);
    }
  });

  it('[S103][S104][S105] payment packages avoid HTTP, database, and DI framework dependencies', () => {
    for (const packagePath of ['packages/payment', 'packages/adfpay-connector']) {
      const packageJson = readPackageJson(packagePath);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      expect(dependencies).not.toHaveProperty('express');
      expect(dependencies).not.toHaveProperty('fastify');
      expect(dependencies).not.toHaveProperty('pg');
      expect(dependencies).not.toHaveProperty('typeorm');
      expect(dependencies).not.toHaveProperty('inversify');
      expect(dependencies).not.toHaveProperty('tsyringe');
    }
  });

  it('[S106] payment and AdfPay packages do not use any', () => {
    for (const packagePath of ['packages/payment/src', 'packages/adfpay-connector/src']) {
      const files = readSourceFiles(join(repoRoot, packagePath));
      for (const source of files) {
        expect(source).not.toMatch(/:\s*any\b/);
      }
    }
  });

  it('[S107] public exports are explicit in package entrypoints', () => {
    const paymentIndex = readFileSync(join(repoRoot, 'packages/payment/src/index.ts'), 'utf8');
    const adfpayIndex = readFileSync(
      join(repoRoot, 'packages/adfpay-connector/src/index.ts'),
      'utf8',
    );

    expect(paymentIndex).toContain('export {');
    expect(adfpayIndex).toContain('export {');
    expect(adfpayIndex).not.toContain('createAdfPayPaymentIngressInput');
  });

  it('[S38] authorization logic is not implemented inside AdfPay parser', () => {
    const parserSource = readFileSync(
      join(repoRoot, 'packages/adfpay-connector/src/parser/adfpay-payment-payload-parser.ts'),
      'utf8',
    );

    expect(parserSource).not.toContain('PaymentAuthorizationPolicy');
    expect(parserSource).not.toContain('isAuthorizedPaymentStatus');
  });

  it('[S39] authorization logic is not implemented inside PipelineRunner', () => {
    const pipelineSource = readFileSync(
      join(repoRoot, 'packages/core/src/application/workflow-pipeline/pipeline-runner.ts'),
      'utf8',
    );

    expect(pipelineSource).not.toContain('PaymentAuthorizationPolicy');
    expect(pipelineSource).not.toContain('isAuthorizedPaymentStatus');
  });
});
