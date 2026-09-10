import { describe, expect, it } from 'vitest';

import { getErrorMessage, isReactionConflict } from '@/utils/errors';

describe('reaction 23505', () => {
  it('treats the Live unique index duplicate as already-on', () => {
    const error = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "reactions_user_post_type_unique_idx"',
    };
    expect(isReactionConflict(error)).toBe(true);
    expect(isReactionConflict(new Error(error.message))).toBe(true);
    expect(getErrorMessage(error)).toBe('Couldn’t complete that just now. Try again.');
    expect(getErrorMessage(error)).not.toContain('23505');
    expect(getErrorMessage(error)).not.toContain('reactions_user_post_type_unique_idx');
  });

  it('does not treat a network miss as already-on', () => {
    expect(isReactionConflict(new Error('Failed to fetch'))).toBe(false);
  });
});
