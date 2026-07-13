import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@dap/notification-engine workspace', () => {
  it('is bootstrapped', () => {
    expect(packageName).toBe('@dap/notification-engine');
  });
});
