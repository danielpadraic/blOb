import { describe, expect, it } from 'vitest';

import { authorLabel, safeUserId } from '@/lib/safeIds';

describe('safeUserId', () => {
  it('does not throw when the user is missing', () => {
    expect(safeUserId(undefined, null, { id: undefined }, '  ')).toBeNull();
    expect(safeUserId(undefined, { id: 'a' }, 'b')).toBe('a');
  });
});

describe('authorLabel', () => {
  it('renders Someone when the author row is missing', () => {
    expect(authorLabel(undefined)).toBe('Someone');
    expect(authorLabel({ username: 'ada' })).toBe('ada');
  });
});
