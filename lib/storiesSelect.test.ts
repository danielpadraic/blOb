import { describe, expect, it } from 'vitest';

import { STORIES_CORE_COLUMNS, schemaFromSelect } from '@/lib/storiesSelect';

describe('stories select', () => {
  it('requests the live stories columns including sequence_id', () => {
    expect(STORIES_CORE_COLUMNS).toContain('sequence_id');
    expect(STORIES_CORE_COLUMNS).toContain('clip_start_ms');
    expect(STORIES_CORE_COLUMNS).toContain('thumbnail_url');
    expect(schemaFromSelect(STORIES_CORE_COLUMNS).hasSequenceId).toBe(true);
  });
});
