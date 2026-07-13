import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/core workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/core');
  });
});
