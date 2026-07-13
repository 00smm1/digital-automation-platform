import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/api-server workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/api-server');
  });
});
