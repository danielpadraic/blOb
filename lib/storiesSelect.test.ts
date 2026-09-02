import { describe, expect, it } from 'vitest';

import {
  STORIES_CORE_COLUMNS,
  STORIES_FALLBACK_DROP,
  missingStoriesColumn,
  schemaFromSelect,
  selectWithoutStoriesColumn,
} from '@/lib/storiesSelect';

describe('stories select', () => {
  it('requests the live stories columns including sequence_id', () => {
    expect(STORIES_CORE_COLUMNS).toContain('sequence_id');
    expect(STORIES_CORE_COLUMNS).toContain('clip_start_ms');
    expect(STORIES_CORE_COLUMNS).toContain('thumbnail_url');
    expect(schemaFromSelect(STORIES_CORE_COLUMNS).hasSequenceId).toBe(true);
  });

  it('can drop sequence_id after a 42703 so Waves hides instead of emptying Home', () => {
    expect(STORIES_FALLBACK_DROP).toContain('sequence_id');
    expect(
      missingStoriesColumn({
        code: '42703',
        message: 'column stories.sequence_id does not exist',
      }),
    ).toBe('sequence_id');
    expect(selectWithoutStoriesColumn(STORIES_CORE_COLUMNS, 'sequence_id')).not.toContain(
      'sequence_id',
    );
  });
});
