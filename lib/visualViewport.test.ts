import { describe, expect, it } from 'vitest';

import { visualViewportOcclusion } from '@/lib/visualViewport';

describe('visualViewportOcclusion', () => {
  it('returns 0 when visualViewport is missing', () => {
    expect(visualViewportOcclusion()).toBe(0);
  });
});
