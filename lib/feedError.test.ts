import { describe, expect, it } from 'vitest';

import { rawFeedError } from '@/lib/feedError';

describe('rawFeedError', () => {
  it('joins Postgrest code, message, details, and hint', () => {
    expect(
      rawFeedError({
        code: '42501',
        message: 'permission denied for table posts',
        details: 'RLS policy "posts_select" failed',
        hint: null,
      }),
    ).toBe('42501 | permission denied for table posts | RLS policy "posts_select" failed');
  });

  it('unwraps a nested error object', () => {
    expect(
      rawFeedError({
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      }),
    ).toBe('PGRST116 | JSON object requested, multiple (or no) rows returned');
  });

  it('falls back to Error.message then a short default', () => {
    expect(rawFeedError(new Error('column posts.circle_id does not exist'))).toBe(
      'column posts.circle_id does not exist',
    );
    expect(rawFeedError(null)).toBe('Feed failed');
  });
});
