import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/provider-sdk workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/provider-sdk');
  });
});
