import { describe, expect, it } from 'vitest';

import {
  STORIES_CORE_COLUMNS,
  dropCachedStoriesColumn,
  missingStoriesColumn,
  resetStoriesSelectCache,
  schemaFromSelect,
  selectWithoutStoriesColumn,
} from '@/lib/storiesSelect';

describe('stories select', () => {
  it('starts from live core columns and never includes sequence_id there', () => {
    expect(STORIES_CORE_COLUMNS).toBe(
      'id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at',
    );
    expect(STORIES_CORE_COLUMNS.includes('sequence_id')).toBe(false);
    expect(schemaFromSelect(STORIES_CORE_COLUMNS).hasSequenceId).toBe(false);
  });

  it('treats 42703 and schema-cache misses as a missing optional column', () => {
    expect(
      missingStoriesColumn({
        code: '42703',
        message: 'column stories.sequence_id does not exist',
      }),
    ).toBe('sequence_id');
    expect(
      missingStoriesColumn({
        code: 'PGRST204',
        message: "Could not find the 'thumbnail_url' column of 'stories' in the schema cache",
      }),
    ).toBe('thumbnail_url');
    expect(missingStoriesColumn({ message: 'permission denied' })).toBeNull();
  });

  it('drops a missing column from the cached select', () => {
    resetStoriesSelectCache();
    const next = dropCachedStoriesColumn('sequence_id');
    expect(next.hasSequenceId).toBe(false);
    expect(selectWithoutStoriesColumn(`${STORIES_CORE_COLUMNS}, sequence_id`, 'sequence_id')).toBe(
      STORIES_CORE_COLUMNS,
    );
  });
});
