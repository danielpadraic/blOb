import { describe, expect, it } from 'vitest';

import { isNamedFriendProfile, namedFriendEdges } from '@/lib/social';

describe('namedFriendEdges', () => {
  it('drops nameless profiles so People rows match the header count', () => {
    const rows = namedFriendEdges([
      { profile: { id: '1', display_name: 'Ada', username: 'ada' } },
      { profile: { id: '2', display_name: '  ', username: '' } },
      { profile: null },
      { profile: { id: '3', display_name: '', username: 'bea' } },
    ]);
    expect(rows.map((row) => row.profile?.id)).toEqual(['1', '3']);
    expect(isNamedFriendProfile({ id: 'x', display_name: '', username: '' })).toBe(false);
  });
});
