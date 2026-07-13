import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/automation-engine workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/automation-engine');
  });
});
