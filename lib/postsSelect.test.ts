import { describe, expect, it } from 'vitest';

import {
  dropCachedCircleId,
  isMissingCircleIdColumn,
  resetPostsSchemaCache,
  selectWithoutCircleId,
} from '@/lib/postsSelect';

describe('posts select circle_id', () => {
  it('strips circle_id from a working select list', () => {
    expect(selectWithoutCircleId('id, author_id, circle_id, content')).toBe('id, author_id, content');
  });

  it('treats schema-cache and 42703 misses as a missing circle_id', () => {
    expect(
      isMissingCircleIdColumn({
        code: 'PGRST204',
        message: "Could not find the 'circle_id' column of 'posts' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingCircleIdColumn({ code: '42703', message: 'column posts.circle_id does not exist' })).toBe(
      true,
    );
    expect(isMissingCircleIdColumn({ message: 'permission denied' })).toBe(false);
  });

  it('clears the cached circle_id flag after a live 400', async () => {
    resetPostsSchemaCache();
    expect(dropCachedCircleId()?.hasCircleId).not.toBe(true);
  });
});
