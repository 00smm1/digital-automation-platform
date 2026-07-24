import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createTestProviderRuntimeStack } from '../testing/create-test-provider-runtime-stack.js';
import { projectProviderRuntimeResultForExecutionRun } from '../application/provider-runtime-result.js';
import { projectProviderExecutionEvidenceForAudit } from '../domain/provider-execution-evidence.js';
import { createProviderDescriptor } from '../domain/provider-descriptor.js';
import { ProviderRuntime } from '../application/provider-runtime.js';
import { ProviderSelectionPolicy } from '../application/provider-selection-policy.js';
import { createProviderTimeoutPolicy } from '../application/provider-timeout-policy.js';
import { DeterministicProviderExecutionAttemptReferenceFactory } from '../application/provider-execution-attempt-reference-factory.js';
import { InMemoryProviderRegistry } from '../infrastructure/in-memory-provider-registry.js';
import { FakeProviderAdapter } from '../testing/fake-provider-adapter.js';
import { createDeterministicTimeoutExecutor } from '../testing/deterministic-timeout-executor.js';
import { FakeClock } from '../shared/clock.js';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const packageSrcRoot = join(repoRoot, 'packages/provider-runtime/src');

export const ALL_SENTINELS = [
  'SUPER_SECRET_PROVIDER_API_KEY',
  'SUPER_SECRET_PROVIDER_PASSWORD',
  'SUPER_SECRET_BEARER_TOKEN',
  'SUPER_SECRET_PROVIDER_RESPONSE',
  'SUPER_SECRET_EXCEPTION_MESSAGE',
  'SUPER_SECRET_STACK_TRACE',
  'SUPER_SECRET_DELIVERY_PASSWORD',
] as const;

export const assertSentinelsAbsent = (serialized: string): void => {
  for (const sentinel of ALL_SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
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

const readPackageJson = () =>
  JSON.parse(readFileSync(join(repoRoot, 'packages/provider-runtime/package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

const domainFiles = readSourceFiles(join(packageSrcRoot, 'domain'));
const applicationFiles = readSourceFiles(join(packageSrcRoot, 'application'));
const infrastructureFiles = readSourceFiles(join(packageSrcRoot, 'infrastructure'));
const allProductionFiles = readSourceFiles(packageSrcRoot).filter(
  (source) => !source.includes('/testing/'),
);

const validExecutionRequestInput = {
  executionRunReference: 'run-arch-001',
  externalOrderReference: 'order-arch-001',
  reservationReference: 'res-arch-001',
  inventoryItemReference: 'item-arch-001',
  requiredCapability: 'digital-subscription-provisioning',
  quantity: 1,
  fulfillmentDefinitionReference: 'fulfillment-arch-001',
  provisioningParameters: {
    kind: 'digital-subscription',
    planReference: 'plan-arch',
    durationReference: 'duration-arch',
  },
  businessIdempotencyReference: 'idempotency-arch-001',
};

describe('Sprint 19 package boundary tests [V01-V18]', () => {
  it('[V01] domain layer does not import infrastructure implementations', () => {
    for (const source of domainFiles) {
      expect(source).not.toMatch(/in-memory-provider-registry/);
      expect(source).not.toMatch(/in-memory-credential-resolver/);
      expect(source).not.toMatch(/timer-timeout-executor/);
    }
  });

  it('[V02] domain layer does not import testing fakes', () => {
    for (const source of domainFiles) {
      expect(source).not.toMatch(/fake-provider-adapter/);
      expect(source).not.toMatch(/create-test-provider-runtime-stack/);
    }
  });

  it('[V03] application layer does not import connector packages', () => {
    for (const source of applicationFiles) {
      expect(source).not.toMatch(/@dap\/woocommerce-connector/);
      expect(source).not.toMatch(/@dap\/adfpay-connector/);
      expect(source).not.toMatch(/woocommerce-connector/);
      expect(source).not.toMatch(/adfpay-connector/);
    }
  });

  it('[V04] provider-runtime does not import core fulfillment composition', () => {
    for (const source of allProductionFiles) {
      expect(source).not.toMatch(/createDigitalFulfillmentStack/);
      expect(source).not.toMatch(/createInboundGatewayStack/);
      expect(source).not.toMatch(/InventoryReservationService/);
    }
  });

  it('[V05] provider-runtime package avoids HTTP and database dependencies', () => {
    const packageJson = readPackageJson();
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(dependencies).not.toHaveProperty('express');
    expect(dependencies).not.toHaveProperty('fastify');
    expect(dependencies).not.toHaveProperty('pg');
    expect(dependencies).not.toHaveProperty('typeorm');
  });

  it('[V06] infrastructure depends on ports not workflow orchestration', () => {
    for (const source of infrastructureFiles) {
      expect(source).not.toMatch(/workflow-pipeline/);
      expect(source).not.toMatch(/execution-run-lifecycle/);
    }
  });

  it('[V07] public index exports provider runtime port contracts', () => {
    const indexSource = readFileSync(join(packageSrcRoot, 'index.ts'), 'utf8');

    expect(indexSource).toContain('./application/provider-runtime.js');
    expect(indexSource).toContain('./application/provider-selection-policy.js');
    expect(indexSource).toContain('./infrastructure/in-memory-provider-registry.js');
    expect(indexSource).toContain('./testing/fake-provider-adapter.js');
  });

  it('[V08] application provider runtime depends on registry port not concrete registry in source', () => {
    const runtimeSource = readFileSync(
      join(packageSrcRoot, 'application/provider-runtime.ts'),
      'utf8',
    );

    expect(runtimeSource).toContain('ProviderRegistry');
    expect(runtimeSource).not.toContain('InMemoryProviderRegistry');
  });

  it('[V09] domain sources do not use any', () => {
    for (const source of domainFiles) {
      expect(source).not.toMatch(/:\s*any\b/);
    }
  });

  it('[V10] application sources do not use global mutable browser state', () => {
    for (const source of applicationFiles) {
      expect(source).not.toMatch(/\bglobalThis\b/);
      expect(source).not.toMatch(/\bwindow\b/);
    }
  });

  it('[V11] provider-runtime does not reference payment authorization modules', () => {
    for (const source of allProductionFiles) {
      expect(source).not.toMatch(/PaymentAuthorizationPolicy/);
      expect(source).not.toMatch(/@dap\/payment/);
    }
  });

  it('[V12] provider-runtime does not reference notification delivery modules', () => {
    for (const source of allProductionFiles) {
      expect(source).not.toMatch(/notification-engine/);
      expect(source).not.toMatch(/@dap\/notification-engine/);
    }
  });

  it('[V13] composition module wires runtime without inventory reservation imports', () => {
    const compositionSource = readFileSync(
      join(
        packageSrcRoot,
        'application/composition/create-digital-provider-runtime-composition.ts',
      ),
      'utf8',
    );

    expect(compositionSource).toContain('ProviderRuntime');
    expect(compositionSource).not.toMatch(/inventory-reservation/);
    expect(compositionSource).not.toMatch(/ReservationPolicy/);
    expect(compositionSource).not.toMatch(/fake-provider-adapter/);
    expect(compositionSource).not.toMatch(/FakeProviderAdapter/);
  });

  it('[V14] domain does not import application services', () => {
    for (const source of domainFiles) {
      expect(source).not.toMatch(/from '\.\.\/application\//);
      expect(source).not.toMatch(/from "\.\.\/application\//);
    }
  });

  it('[V15] testing helpers remain outside production export surface except explicit testing exports', () => {
    const indexSource = readFileSync(join(packageSrcRoot, 'index.ts'), 'utf8');
    expect(indexSource).toContain('./testing/create-test-provider-runtime-stack.js');
    expect(indexSource).not.toContain('./testing/deterministic-timeout-executor.test');
  });

  it('[V16] provider-runtime README states inventory reservation is out of scope', () => {
    const readme = readFileSync(join(repoRoot, 'packages/provider-runtime/README.md'), 'utf8');
    expect(readme).toContain('Inventory reservation');
    expect(readme).toContain('Does not own');
  });

  it('[V17] package remains provider-neutral in domain naming', () => {
    for (const source of domainFiles) {
      expect(source).not.toMatch(/WooCommerce/);
      expect(source).not.toMatch(/AdfPay/);
    }
  });

  it('[V18] infrastructure in-memory registry clones descriptors on read paths', () => {
    const registrySource = readFileSync(
      join(packageSrcRoot, 'infrastructure/in-memory-provider-registry.ts'),
      'utf8',
    );

    expect(registrySource).toContain('cloneProviderDescriptor');
    expect(registrySource).toContain('listDescriptorsByCapability');
  });
});

describe('Sprint 19 sentinel safety tests [T01-T12]', () => {
  it('[T01] successful runtime execution projection excludes all sentinel secrets', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    assertSentinelsAbsent(JSON.stringify(result));
    assertSentinelsAbsent(JSON.stringify(projectProviderRuntimeResultForExecutionRun(result)));
  });

  it('[T02] adapter rejection projection excludes sentinel secrets', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('rejected');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    assertSentinelsAbsent(JSON.stringify(projectProviderRuntimeResultForExecutionRun(result)));
  });

  it('[T03] adapter exception projection excludes exception message sentinel', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('throw');
    stack.fakeAdapter.setConfiguredException(new Error(ALL_SENTINELS[4]));

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const serialized = JSON.stringify(result);

    assertSentinelsAbsent(serialized);
    expect(serialized).not.toContain('stack');
  });

  it('[T04] timeout failure projection excludes sentinel secrets', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('pending');
    stack.timeoutExecutor.setMode('timeout');

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    assertSentinelsAbsent(JSON.stringify(projectProviderRuntimeResultForExecutionRun(result)));
  });

  it('[T05] evidence audit projection excludes sentinel secrets on success', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    if (result.kind === 'provider-execution-succeeded') {
      const projection = projectProviderExecutionEvidenceForAudit(result.safeEvidence);
      assertSentinelsAbsent(JSON.stringify(projection));
    } else {
      throw new Error('expected success');
    }
  });

  it('[T06] evidence audit projection excludes sentinel secrets on failure', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('unavailable');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    if (result.safeEvidence !== undefined) {
      assertSentinelsAbsent(
        JSON.stringify(projectProviderExecutionEvidenceForAudit(result.safeEvidence)),
      );
    }
  });

  it('[T07] credential resolver failure outcomes exclude stored secret values', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.credentialResolver.store({
      credentialReference: 'missing-binding' as never,
      secretValue: ALL_SENTINELS[1],
      providerReference: 'other-provider' as never,
    });

    stack.fakeAdapter.setMode('success');
    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[T08] fake adapter invocations exclude credential secret values', async () => {
    const stack = createTestProviderRuntimeStack();
    await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);

    assertSentinelsAbsent(JSON.stringify(stack.fakeAdapter.getInvocations()));
  });

  it('[T09] invalid provider request outcome excludes sentinel-bearing input echoes', async () => {
    const stack = createTestProviderRuntimeStack();
    const result = await stack.providerRuntime.executeProvisioning({
      ...validExecutionRequestInput,
      externalOrderReference: ALL_SENTINELS[3],
      quantity: 0,
    });

    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[T10] selection failure outcome excludes sentinel secrets', async () => {
    const registry = new InMemoryProviderRegistry();
    const adapter = new FakeProviderAdapter();
    const disabledOnly = createProviderDescriptor({
      providerReference: 'inactive-provider',
      providerKind: 'digital-provisioning-provider',
      supportedCapabilities: ['digital-subscription-provisioning'],
      status: 'disabled',
      health: 'healthy',
      priority: 0,
      credentialReference: 'credential-inactive-provider',
    });

    expect(disabledOnly.ok).toBe(true);
    if (!disabledOnly.ok) {
      return;
    }

    registry.register({ descriptor: disabledOnly.value, adapter });

    const timeoutPolicy = createProviderTimeoutPolicy({ defaultTimeoutMilliseconds: 5_000 });
    expect(timeoutPolicy.ok).toBe(true);
    if (!timeoutPolicy.ok) {
      return;
    }

    const runtime = new ProviderRuntime({
      registry,
      selectionPolicy: new ProviderSelectionPolicy(),
      attemptReferenceFactory: new DeterministicProviderExecutionAttemptReferenceFactory('attempt'),
      clock: new FakeClock(new Date('2026-07-24T12:00:00.000Z')),
      timeoutPolicy: timeoutPolicy.value,
      timeoutExecutor: createDeterministicTimeoutExecutor(),
    });

    const result = await runtime.executeProvisioning(validExecutionRequestInput);

    expect(result.kind).toBe('provider-selection-failed');
    assertSentinelsAbsent(JSON.stringify(result));
  });

  it('[T11] serialized failures exclude Error type names and stack traces', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.fakeAdapter.setMode('throw');
    stack.fakeAdapter.setConfiguredException(new Error(`${ALL_SENTINELS[4]}\n${ALL_SENTINELS[5]}`));

    const serialized = JSON.stringify(
      await stack.providerRuntime.executeProvisioning(validExecutionRequestInput),
    );

    expect(serialized).not.toMatch(/"stack"/);
    assertSentinelsAbsent(serialized);
  });

  it('[T12] safe execution-run projection excludes credential and delivery password sentinels', async () => {
    const stack = createTestProviderRuntimeStack();
    stack.credentialResolver.store({
      credentialReference: 'credential-fake-digital-provider' as never,
      secretValue: ALL_SENTINELS[6],
      providerReference: 'fake-digital-provider' as never,
    });

    const result = await stack.providerRuntime.executeProvisioning(validExecutionRequestInput);
    const projection = projectProviderRuntimeResultForExecutionRun(result);

    assertSentinelsAbsent(JSON.stringify(projection));
    if (result.kind === 'provider-execution-succeeded') {
      assertSentinelsAbsent(
        JSON.stringify(projectProviderExecutionEvidenceForAudit(result.safeEvidence)),
      );
    }
  });
});
