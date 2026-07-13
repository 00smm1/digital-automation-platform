import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/admin-dashboard workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/admin-dashboard');
  });
});
