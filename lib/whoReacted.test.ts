import { describe, expect, it } from 'vitest';

import { whoReactedTypeFilter } from '@/lib/whoReacted';

describe('whoReactedTypeFilter', () => {
  it('asks for laugh and leftover care rows together', () => {
    expect(whoReactedTypeFilter('laugh')).toEqual(['laugh', 'care']);
    expect(whoReactedTypeFilter('care')).toEqual(['laugh', 'care']);
    expect(whoReactedTypeFilter('like')).toEqual(['like']);
    expect(whoReactedTypeFilter('rofl')).toEqual(['rofl']);
  });
});
