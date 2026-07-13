import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/wordpress-plugin workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/wordpress-plugin');
  });
});
