import { describe, expect, it } from 'vitest';

import { conversationTitle } from '@/lib/social';

describe('conversationTitle', () => {
  it('does not call people.map when people is missing (group thread)', () => {
    expect(
      conversationTitle({
        is_group: true,
        peer: null,
        people: undefined as unknown as [],
      }),
    ).toBe('Group');
  });

  it('names a group from the people list', () => {
    expect(
      conversationTitle({
        is_group: true,
        peer: null,
        people: [
          { id: '1', username: 'a', display_name: 'Ann' },
          { id: '2', username: 'b', display_name: 'Bea' },
        ] as never,
      }),
    ).toBe('Ann and Bea');
  });

  it('uses the peer on a 1:1', () => {
    expect(
      conversationTitle({
        is_group: false,
        peer: { id: '1', username: 'courtney', display_name: 'Courtney' } as never,
        people: [],
      }),
    ).toBe('Courtney');
  });
});
